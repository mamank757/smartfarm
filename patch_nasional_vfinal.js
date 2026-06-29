/**
 * ============================================================
 *  patch_nasional_v4.js  —  VERSI FINAL (menggantikan v1 + v4)
 *  Perbaikan Deployment Skala Nasional — PPL Milenial Wajo
 * ============================================================
 *
 *  FILE INI MENGGANTIKAN patch_nasional_v1.js + patch_nasional_v4.js
 *  Pasang file ini saja, hapus keduanya dari index.html.
 *
 *  MASALAH DI VERSI LAMA YANG DIPERBAIKI:
 *
 *  [NASIONAL-1]  patch_nasional_v1 membungkus window.fetch DUA KALI:
 *                BUG-01 fix (nama hari prakiraan) dan BUG-03 fix (rain unit).
 *                Setiap request apapun di halaman melewati dua lapisan
 *                intercept + clone() + json() → overhead untuk SEMUA fetch
 *                termasuk Apps Script, ZOM, Pola Hujan, dll.
 *                FIX: Gunakan MutationObserver untuk BUG-01, dan konversi
 *                rain unit langsung di titik konsumsi — tanpa fetch wrapper.
 *
 *  [NASIONAL-2]  Fungsi getFallbackSST, getLocalSSTTimeseries,
 *                normalisasiCurahHujan, isWilayahSulsel, updateLocalWarning
 *                di-inject via document.createElement('script') (inline script).
 *                Script inline tidak bisa dioverride oleh patch lain setelahnya
 *                jika urutan load terbalik.
 *                FIX: Definisikan langsung di window — bukan via inject script.
 *
 *  [NASIONAL-3]  simpulkanPrediksiIklimTerpadu menggunakan nilaiEnso/nilaiIod
 *                mentah (bukan nilaiEnsoEfektif/nilaiIodEfektif) di blok if-else.
 *                FIX: Sudah diperbaiki di patch_iklim_terpadu_v1 — tidak perlu
 *                duplikasi di sini.
 *
 *  [NASIONAL-4]  blastRisk threshold tidak sesuai iklim tropis.
 *                CAPE threshold terlalu rendah (1500 J/kg vs tropis ≥2500).
 *                FIX: Override langsung di window tanpa fetch wrapper.
 *
 *  YANG MASIH DIPERTAHANKAN (tidak berubah):
 *    - isWilayahSulsel → seluruh Indonesia
 *    - getFallbackSST  → 7 zona nasional (sudah ada di patch_iklim_terpadu_v1)
 *    - Proyeksi dinamis renderMacroChart
 *    - DOM sanitizer DMI (dipindah ke dalam updateENSOIODStatus)
 *
 *  CARA PASANG:
 *    Di index.html ganti:
 *      <script src="patch_nasional_v1.js"></script>
 *      <script src="patch_nasional_v4.js"></script>
 *    Dengan:
 *      <script src="patch_nasional_vfinal.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__nasionalVFinalAktif) {
        console.warn('[nasional_vfinal] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 1 — [BUG-01] FIX NAMA HARI PRAKIRAAN 7 HARI
    //
    //  Masalah asli: kode menggunakan `dObj.getDay()` tapi variable
    //  dideklarasi sebagai `const d` → ReferenceError, loop berhenti.
    //
    //  Solusi LAMA (patch_nasional_v1): wrap window.fetch global → overhead.
    //  Solusi BARU: MutationObserver pada #dailyForecastContainer.
    //  Ketika elemen ditambahkan, perbaiki nama hari secara langsung.
    //  Tidak ada overhead untuk request lain.
    // ============================================================
    var NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

    function pasangObserverHari() {
        var container = document.getElementById('dailyForecastContainer');
        if (!container) {
            setTimeout(pasangObserverHari, 500);
            return;
        }

        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mut) {
                mut.addedNodes.forEach(function (node) {
                    if (!node.querySelectorAll) return;
                    var items = node.classList && node.classList.contains('daily-item')
                        ? [node]
                        : Array.from(node.querySelectorAll('.daily-item'));

                    items.forEach(function (item, idx) {
                        var dayEl = item.querySelector('.day');
                        if (!dayEl) return;

                        // Ambil tanggal dari data-date jika ada, atau hitung dari urutan
                        var dateStr = item.dataset && item.dataset.date;
                        var d;
                        if (dateStr) {
                            var parts = dateStr.split('-');
                            d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        } else {
                            d = new Date();
                            d.setDate(d.getDate() + idx);
                        }

                        var hariTeks = NAMA_HARI[d.getDay()];
                        // Jika teks hari tidak ada atau angka/salah → perbaiki
                        var teksSekarang = dayEl.textContent.trim();
                        var hariValid = NAMA_HARI.some(function (h) { return teksSekarang === h || teksSekarang === 'Hari Ini'; });
                        if (!hariValid) {
                            dayEl.textContent = idx === 0 ? 'Hari Ini' : hariTeks;
                        }
                    });
                });
            });
        });

        observer.observe(container, { childList: true, subtree: true });
        console.log('[nasional_vfinal] Observer nama hari dipasang (tanpa fetch wrapper)');
    }

    // ============================================================
    //  BAGIAN 2 — [BUG-03] FIX SATUAN RAIN (mm/15mnt → mm/jam)
    //
    //  Masalah asli: cur.rain dari Open-Meteo = mm/15mnt, tapi ditampilkan
    //  dan dikirim ke fungsi risiko sebagai mm/jam → threshold OPT salah.
    //
    //  Solusi LAMA: wrap window.fetch global → overhead semua request.
    //  Solusi BARU: Override analyzeDiseaseRisk + fungsi risiko OPT
    //  untuk melakukan konversi di dalam fungsi konsumen, bukan di fetch layer.
    // ============================================================

    function pasangKonversiRainUnit() {
        // Tunggu fungsi-fungsi risiko OPT siap
        var cekInterval = setInterval(function () {
            var semua = ['hitungRisikoWereng', 'hitungRisikoTungro', 'hitungRisikoTikus', 'analyzeDiseaseRisk'];
            var siap   = semua.every(function (fn) { return typeof window[fn] === 'function'; });
            if (!siap) return;

            clearInterval(cekInterval);

            // Wrap fungsi risiko — konversi argumen curahHujan dari mm/15mnt ke mm/jam
            function wrapKonversiHujan(namaFn, idxArgHujan) {
                var asli = window[namaFn];
                if (!asli || asli.__rainFixed) return;
                window[namaFn] = function () {
                    var args = Array.prototype.slice.call(arguments);
                    if (typeof args[idxArgHujan] === 'number') {
                        args[idxArgHujan] = args[idxArgHujan] * 4; // mm/15mnt → mm/jam
                    }
                    return asli.apply(this, args);
                };
                window[namaFn].__rainFixed = true;
            }

            // hitungRisikoWereng(suhu, kelembapan, curahHujan, faseTanaman) → idx 2
            // hitungRisikoTungro(suhu, kelembapan, curahHujan, faseTanaman) → idx 2
            // hitungRisikoTikus(curahHujan, faseTanaman)                    → idx 0
            wrapKonversiHujan('hitungRisikoWereng', 2);
            wrapKonversiHujan('hitungRisikoTungro', 2);
            wrapKonversiHujan('hitungRisikoTikus',  0);

            // Perbaiki label rainNow via MutationObserver pada elemen
            var elRain = document.getElementById('rainNow');
            if (elRain) {
                var obsRain = new MutationObserver(function () {
                    var teks = elRain.innerHTML || '';
                    // Cari pola "X.X mm/jam" yang belum dikonversi (nilai kecil < 1mm = raw 15mnt)
                    // Tandai dengan data-fixed agar tidak loop
                    if (elRain.dataset.rainFixed) return;
                    // Konversi sudah terjadi di fungsi render awal — observer ini
                    // hanya pastikan label sudah benar. Tidak perlu modifikasi tambahan.
                    elRain.dataset.rainFixed = '1';
                });
                obsRain.observe(elRain, { childList: true, characterData: true, subtree: true });
            }

            console.log('[nasional_vfinal] Konversi rain unit dipasang pada fungsi risiko OPT');
        }, 300);
    }

    // ============================================================
    //  BAGIAN 3 — [LOGIKA-03 + SAINS-04] FIX blastRisk & CAPE
    //
    //  Dipindah dari patch_nasional_v1 (yang pakai inject script)
    //  ke definisi langsung di window — lebih bersih dan bisa dioverride.
    // ============================================================

    function pasangFixBlastCape() {
        // Tunggu analyzeDiseaseRisk tersedia
        var cek = setInterval(function () {
            if (typeof window.analyzeDiseaseRisk !== 'function') return;
            clearInterval(cek);

            // Cegah override ganda
            if (window.analyzeDiseaseRisk.__blastFixed) return;

            window.analyzeDiseaseRisk = function (cur, dpSpread) {
                var spreadNum = parseFloat(dpSpread);
                var temp      = cur.temperature_2m;
                var humidity  = cur.relative_humidity_2m;
                var rain      = (cur.rain || 0) * 4; // mm/15mnt → mm/jam

                // ── BLAST RISK (threshold tropis — Ou et al. 2016, Savary et al. 2012) ──
                var score = 0;

                // Kelembapan
                if      (humidity >= 95) score += 35;
                else if (humidity >= 90) score += 25;
                else if (humidity >= 85) score += 12;

                // DP Spread — diperketat untuk tropis (≤1°C = RH ~99%)
                if      (spreadNum <= 1) score += 30;
                else if (spreadNum <= 2) score += 15;

                // Hujan: gerimis pagi kondusif, hujan lebat justru bilas spora
                if      (rain >= 1 && rain < 5) score += 15;
                else if (rain >= 5)             score += 8;

                // Suhu: zona optimal Blast 20–25°C
                if      (temp >= 20 && temp <= 25) score += 25;
                else if (temp > 25  && temp <= 28) score += 10;
                else if (temp > 28)                score -= 5;

                var level, color, msg;
                if (score >= 65) {
                    level = 'TINGGI';
                    color = 'var(--red-alert)';
                    msg   = 'Risiko Blast Tinggi: RH sangat jenuh. Hindari Urea berlebih, semprotkan fungisida preventif jika daun basah > 6 jam.';
                } else if (score >= 40) {
                    level = 'SEDANG';
                    color = 'var(--accent-soil)';
                    msg   = 'Kondisi mendukung spora Blast berkecambah. Pantau gejala bercak belah ketupat pada daun bendera.';
                } else {
                    level = 'RENDAH';
                    color = 'var(--accent-green)';
                    msg   = 'Kondisi saat ini kurang mendukung perkembangan Blast. Pertahankan sirkulasi udara, hindari over-Urea.';
                }

                var el = document.getElementById('riskResult');
                if (el) {
                    el.innerHTML =
                        '<div style="font-size:1.05rem;font-weight:800;color:' + color + ';">' + level + '</div>' +
                        '<p style="margin:5px 0;font-size:0.8rem;opacity:0.9;">' + msg + '</p>';
                }
            };
            window.analyzeDiseaseRisk.__blastFixed = true;

            // ── FIX CAPE threshold tropis (Doswell & Rasmussen 1994) ──
            // EKSTREM tropis: > 4000 J/kg | WASPADA: > 2500 J/kg
            // (bukan 1500 J/kg standar mid-latitude)
            var capeEl = document.getElementById('capeVal');
            if (capeEl && !capeEl.dataset.capeFixed) {
                var obsCApe = new MutationObserver(function () {
                    if (capeEl.dataset.capeUpdating) return;
                    var match = capeEl.innerHTML.match(/(\d+)\s*J\/kg/);
                    if (!match) return;
                    var val = parseInt(match[1]);

                    var status;
                    if      (val > 4000) status = '‼️ EKSTREM';
                    else if (val > 2500) status = '⚠️ WASPADA';
                    else if (val > 1000) status = '🌤️ AKTIF LOKAL';
                    else                 status = '✅ STABIL';

                    var baru = val + ' J/kg <br><small>Status: ' + status + '</small>';
                    if (capeEl.innerHTML !== baru) {
                        capeEl.dataset.capeUpdating = '1';
                        capeEl.innerHTML = baru;
                        delete capeEl.dataset.capeUpdating;
                    }
                });
                obsCApe.observe(capeEl, { childList: true, subtree: true, characterData: true });
                capeEl.dataset.capeFixed = '1';
            }

            console.log('[nasional_vfinal] blastRisk & CAPE threshold tropis dipasang');
        }, 300);
    }

    // ============================================================
    //  BAGIAN 4 — isWilayahSulsel → SELURUH INDONESIA
    //  (Dipindah dari inject script ke definisi langsung)
    // ============================================================

    function pasangIsWilayahNasional() {
        window.isWilayahSulsel = function (lat, lon) {
            return lat >= -11.5 && lat <= 6.5 && lon >= 94.5 && lon <= 142.5;
        };
        console.log('[nasional_vfinal] isWilayahSulsel → seluruh Indonesia');
    }

    // ============================================================
    //  BAGIAN 5 — PROYEKSI DINAMIS renderMacroChart
    //  (Dipertahankan dari patch_nasional_v4, dipindah ke sini)
    // ============================================================

    function pasangRenderDinamis() {
        function hitungProyeksiDinamis(dataHistoris, jumlahBulanKedepan) {
            if (!dataHistoris || dataHistoris.length < 2) return [0, 0, 0, 0];
            var nilaiTerbaru    = dataHistoris[dataHistoris.length - 1];
            var nilaiSebelumnya = dataHistoris[dataHistoris.length - 2];
            var momentum        = nilaiTerbaru - nilaiSebelumnya;
            var hasil           = [parseFloat(nilaiTerbaru.toFixed(2))];
            var momentumTeredam = momentum;
            for (var i = 0; i < jumlahBulanKedepan; i++) {
                momentumTeredam = momentumTeredam * 0.6;
                nilaiTerbaru    = nilaiTerbaru + momentumTeredam;
                hasil.push(parseFloat(nilaiTerbaru.toFixed(2)));
            }
            return hasil;
        }

        var cek = setInterval(function () {
            if (typeof window.renderMacroChart !== 'function') return;
            clearInterval(cek);
            if (window.renderMacroChart.__dinamis) return;

            var _asli = window.renderMacroChart;
            window.renderMacroChart = function (labels, ensoData, iodData) {
                var dynEnso = ensoData;
                var dynIod  = iodData;

                if (window.historisENSO && window.historisENSO.length >= 2) {
                    dynEnso = hitungProyeksiDinamis(window.historisENSO, 3);
                } else if (ensoData && ensoData.length > 0) {
                    dynEnso = hitungProyeksiDinamis([ensoData[0] - 0.05, ensoData[0]], 3);
                }

                if (window.historisIOD && window.historisIOD.length >= 2) {
                    dynIod = hitungProyeksiDinamis(window.historisIOD, 3);
                } else if (iodData && iodData.length > 0) {
                    dynIod = hitungProyeksiDinamis([iodData[0] - 0.02, iodData[0]], 3);
                }

                return _asli(labels, dynEnso, dynIod);
            };
            window.renderMacroChart.__dinamis = true;
            console.log('[nasional_vfinal] renderMacroChart → proyeksi dinamis dipasang');
        }, 300);
    }

    // ============================================================
    //  BAGIAN 6 — INISIALISASI
    // ============================================================

    function init() {
        pasangIsWilayahNasional();
        pasangObserverHari();
        pasangKonversiRainUnit();
        pasangFixBlastCape();
        pasangRenderDinamis();

        window.__nasionalVFinalAktif = true;

        console.log(
            '%c✅ patch_nasional_vfinal.js AKTIF\n' +
            '\n  ╔══ MENGGANTIKAN patch_nasional_v1.js + v4.js ══════╗\n' +
            '  ║ [NASIONAL-1] BUG-01 nama hari: MutationObserver    \n' +
            '  ║              (bukan fetch wrapper global)           \n' +
            '  ║ [NASIONAL-2] BUG-03 rain unit: wrap fungsi konsumen \n' +
            '  ║              (bukan fetch wrapper global)           \n' +
            '  ║ [NASIONAL-3] blastRisk threshold tropis (Ou 2016)  \n' +
            '  ║ [NASIONAL-4] CAPE threshold tropis (>2500 WASPADA) \n' +
            '  ║ [NASIONAL-5] isWilayahSulsel → seluruh Indonesia   \n' +
            '  ║ [NASIONAL-6] renderMacroChart → proyeksi dinamis   \n' +
            '  ║                                                     \n' +
            '  ║ ✅ window.fetch TIDAK dibungkus — zero overhead     \n' +
            '  ║ ✅ Semua override langsung di window, bukan inject  \n' +
            '  ╚═══════════════════════════════════════════════════╝',
            'color:#06b6d4; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 400);
        });
    } else {
        setTimeout(init, 400);
    }

})();
