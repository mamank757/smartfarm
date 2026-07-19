/**
 * ============================================================
 * patch_skenario_enso_iklim.js
 * Panel "Rentang Ketidakpastian & Skenario ENSO" — RISIKO IKLIM
 * ------------------------------------------------------------
 * LATAR BELAKANG:
 *   Diminta menambahkan 2 ide dari contoh halaman mandiri
 *   "Proyeksi Curah Hujan Dasarian — Poisson × ENSO":
 *     1. Rentang ketidakpastian (mirip P10–P90) untuk skor risiko
 *     2. Slider untuk menguji skenario ENSO manual
 *   TAPI — halaman contoh itu pakai baseline & skenario ENSO
 *   REKAAN (statis, cuma 1 tahun data, angka ENSO-nya bahkan
 *   melebihi rekor 44 tahun sejarah). Patch ini mengambil KEDUA
 *   IDE itu tapi disambungkan ke DATA LIVE yang sudah ada di
 *   aplikasi (713 stasiun ZOM riil + ENSO live NOAA CPC), BUKAN
 *   angka rekaan baru.
 *
 * BAGAIMANA RENTANG KETIDAKPASTIAN DIHITUNG (jujur, bukan
 * distribusi statistik formal seperti Poisson/Gamma — karena
 * baseline yang tersedia tidak cukup panjang untuk itu):
 *   Margin = |proyeksi ENSO 3 bulan ke depan − nilai sekarang|,
 *   diambil dari trend-projection yang SUDAH DIHITUNG oleh
 *   getENSOAnomaly() sendiri (patch_enso_iod_noaa.js). Ini
 *   sensitivity analysis (skor dihitung ulang di ENSO−margin,
 *   ENSO, ENSO+margin) — BUKAN klaim P10/P90 statistik formal.
 *   Semakin cepat ENSO sedang bergerak, semakin lebar rentangnya
 *   — mencerminkan ketidakpastian proyeksi apa adanya, tidak
 *   dibuat-buat.
 *
 * BAGAIMANA SKENARIO MANUAL BEKERJA:
 *   window.getENSOAnomaly DIBUNGKUS (bukan diganti) — kalau ada
 *   skenario aktif (window._ensoSkenarioOverride terisi angka),
 *   nilai itu dipakai SEBAGAI PENGGANTI ensoData.latestAnomaly di
 *   SELURUH aplikasi (bukan cuma panel ini) — supaya Kalender TNM,
 *   6-Faktor, dsb. semuanya konsisten memakai skenario yang sama
 *   saat sedang diuji. Tombol reset mengembalikan ke data live.
 *
 * TIDAK MENYENTUH hitungRisikoDinamis/getENSOAnomaly ASLI —
 * keduanya cuma DIBUNGKUS di lapisan TERLUAR (setelah semua patch
 * lain), pola yang sama dipakai di seluruh aplikasi ini.
 *
 * CARA PASANG — letakkan PALING TERAKHIR di index.html:
 *   <script src="patch_fix_label_masuk_tabela_v1.js"></script>
 *   <script src="patch_skenario_enso_iklim.js"></script>  ← file ini
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__skenarioEnsoIklimAktif) {
        console.warn('[skenario_enso] sudah aktif, skip.');
        return;
    }

    var FASE_URUT = ['Tanam', 'Vegetatif', 'Generatif', 'Panen'];
    var FASE_IKON = { Tanam: '🌱', Vegetatif: '🌾', Generatif: '🌼', Panen: '🌾' };

    // ============================================================
    //  1. CAPTURE argumen (bulanIndex, iodVal, baselineData) dari
    //  4 panggilan hitungRisikoDinamis terakhir — TANPA mengubah
    //  perilaku sama sekali (murni pass-through + catat).
    // ============================================================
    function pasangCaptureArgumen(tick) {
        tick = tick || 0;
        if (typeof window.hitungRisikoDinamis !== 'function') {
            if (tick >= 80) { console.error('[skenario_enso] window.hitungRisikoDinamis tidak tersedia.'); return; }
            setTimeout(function () { pasangCaptureArgumen(tick + 1); }, 100);
            return;
        }
        if (window.hitungRisikoDinamis.__capturedUntukSkenario) return;

        var asli = window.hitungRisikoDinamis;
        var dibungkus = function (bulanIndex, fase, ensoVal, iodVal, baselineData) {
            var hasil = asli.apply(this, arguments);
            window._risikoCallLogTerakhir = window._risikoCallLogTerakhir || {};
            window._risikoCallLogTerakhir[fase] = {
                bulanIndex: bulanIndex,
                iodVal: iodVal,
                baselineData: baselineData
            };
            return hasil;
        };
        dibungkus.__capturedUntukSkenario = true;
        window.hitungRisikoDinamis = dibungkus;
    }

    // ============================================================
    //  2. WRAP getENSOAnomaly — dukung override skenario manual.
    // ============================================================
    function klasifikasiENSOLokal(oni) {
        var status = 'Netral', intensitas = '';
        if      (oni >= 2.0)  { status = 'El Niño'; intensitas = 'Super / Sangat Kuat'; }
        else if (oni >= 1.5)  { status = 'El Niño'; intensitas = 'Kuat'; }
        else if (oni >= 1.0)  { status = 'El Niño'; intensitas = 'Moderat'; }
        else if (oni >= 0.5)  { status = 'El Niño'; intensitas = 'Lemah'; }
        else if (oni <= -2.0) { status = 'La Niña'; intensitas = 'Sangat Kuat'; }
        else if (oni <= -1.5) { status = 'La Niña'; intensitas = 'Kuat'; }
        else if (oni <= -1.0) { status = 'La Niña'; intensitas = 'Moderat'; }
        else if (oni <= -0.5) { status = 'La Niña'; intensitas = 'Lemah'; }
        return {
            singkat: status,
            label: intensitas ? (status + ' (' + intensitas + ')') : status
        };
    }

    function pasangOverrideENSO(tick) {
        tick = tick || 0;
        if (typeof window.getENSOAnomaly !== 'function') {
            if (tick >= 80) { console.error('[skenario_enso] window.getENSOAnomaly tidak tersedia.'); return; }
            setTimeout(function () { pasangOverrideENSO(tick + 1); }, 100);
            return;
        }
        if (window.getENSOAnomaly.__skenarioWrapped) return;

        var asli = window.getENSOAnomaly;
        var dibungkus = async function () {
            var hasilAsli = await asli.apply(this, arguments);
            // Simpan data ASLI (live) — dipakai untuk hitung margin
            // ketidakpastian, terlepas dari skenario sedang aktif atau tidak.
            window._ensoDataTerakhir = hasilAsli;

            var override = window._ensoSkenarioOverride;
            if (override !== null && override !== undefined && !isNaN(override)) {
                var salinan = JSON.parse(JSON.stringify(hasilAsli));
                salinan.latestAnomaly = override;
                var klas = klasifikasiENSOLokal(override);
                salinan.status = klas.label + ' — skenario manual';
                salinan.statusSingkat = klas.singkat;
                salinan.sumber = 'Skenario manual PPL (bukan data live NOAA)';
                return salinan;
            }
            return hasilAsli;
        };
        dibungkus.__skenarioWrapped = true;
        window.getENSOAnomaly = dibungkus;
    }

    // ============================================================
    //  3. HITUNG margin ketidakpastian dari trend proyeksi
    //  getENSOAnomaly() sendiri (bukan angka rekaan baru).
    // ============================================================
    function hitungMarginKetidakpastian() {
        var d = window._ensoDataTerakhir;
        if (!d || !Array.isArray(d.anomalies) || d.anomalies.length < 4) return 0.3;
        var margin = Math.abs(d.anomalies[3] - d.anomalies[0]);
        return Math.max(0.2, Math.min(1.5, margin));
    }

    // ============================================================
    //  4. HITUNG skor rendah/tengah/tinggi untuk semua fase
    //  memakai kembali argumen yang sudah ter-capture — tidak
    //  mengulang logika pemilihan zona/baseline sama sekali.
    // ============================================================
    function hitungRentangSemuaFase(ensoTengah, margin) {
        var log = window._risikoCallLogTerakhir;
        if (!log) return null;

        var hasil = {};
        FASE_URUT.forEach(function (fase) {
            var c = log[fase];
            if (!c) return;
            var rendah = window.hitungRisikoDinamis(c.bulanIndex, fase, ensoTengah - margin, c.iodVal, c.baselineData);
            var tengah = window.hitungRisikoDinamis(c.bulanIndex, fase, ensoTengah,          c.iodVal, c.baselineData);
            var tinggi = window.hitungRisikoDinamis(c.bulanIndex, fase, ensoTengah + margin, c.iodVal, c.baselineData);
            hasil[fase] = { rendah: rendah, tengah: tengah, tinggi: tinggi };
        });
        return hasil;
    }

    // ============================================================
    //  5. RENDER panel
    // ============================================================
    function warnaAman(skor) {
        if (typeof window.getWarnaRisiko === 'function') return window.getWarnaRisiko(skor);
        if (skor >= 70) return '#ef4444';
        if (skor >= 40) return '#f59e0b';
        return '#10b981';
    }

    function renderIsiPanel() {
        var elIsi = document.getElementById('skenarioEnsoIsi');
        if (!elIsi) return;

        var dataLive = window._ensoDataTerakhir;
        if (!dataLive) {
            elIsi.innerHTML = '<div style="font-size:0.78rem;color:#94a3b8;padding:8px 0;">Data ENSO belum tersedia — jalankan analisis di atas dulu.</div>';
            return;
        }

        var override = window._ensoSkenarioOverride;
        var sedangSkenario = (override !== null && override !== undefined && !isNaN(override));
        var ensoTengah = sedangSkenario ? override : dataLive.latestAnomaly;
        var margin = hitungMarginKetidakpastian();

        var rentang = hitungRentangSemuaFase(ensoTengah, margin);

        var htmlSlider =
            '<div style="margin-bottom:14px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">' +
                    '<span style="font-size:0.72rem;color:#94a3b8;">🎯 SKENARIO ENSO MANUAL (ONI °C)</span>' +
                    '<span style="font-size:0.85rem;font-weight:700;color:#eab308;" id="skenarioEnsoNilai">' + ensoTengah.toFixed(1) + '</span>' +
                '</div>' +
                '<input type="range" id="skenarioEnsoSlider" min="-3" max="3" step="0.1" value="' + ensoTengah.toFixed(1) + '" style="width:100%;accent-color:#eab308;">' +
                '<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:#64748b;margin-top:2px;">' +
                    '<span>−3 La Niña Kuat</span><span>0 Netral</span><span>+3 El Niño Kuat</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">' +
                    '<span style="font-size:0.68rem;color:#64748b;">' +
                        (sedangSkenario
                            ? '⚠️ Sedang uji skenario manual — bukan data live'
                            : '✅ Memakai data live NOAA: ' + dataLive.latestAnomaly.toFixed(2) + '°C (' + (dataLive.sumber || '-') + ')') +
                    '</span>' +
                    (sedangSkenario
                        ? '<button id="skenarioEnsoReset" style="font-size:0.66rem;font-weight:700;padding:5px 10px;border-radius:8px;background:rgba(234,179,8,0.15);color:#eab308;border:1px solid rgba(234,179,8,0.4);cursor:pointer;">🔄 Kembali ke Live</button>'
                        : '') +
                '</div>' +
            '</div>';

        var htmlMargin =
            '<div style="font-size:0.66rem;color:#64748b;margin-bottom:12px;line-height:1.5;">' +
                'Rentang rendah/tinggi = skor dihitung ulang pada ENSO ±' + margin.toFixed(2) + '°C dari nilai tengah — ' +
                'margin ini diambil dari seberapa jauh proyeksi tren ENSO 3 bulan ke depan bisa bergeser (bukan angka tetap). ' +
                'Ini analisis sensitivitas, <em>bukan</em> distribusi probabilitas statistik formal — baseline yang tersedia ' +
                'belum cukup panjang untuk itu.' +
            '</div>';

        var htmlFase = '';
        if (rentang) {
            FASE_URUT.forEach(function (fase) {
                var r = rentang[fase];
                if (!r) return;
                var wT = warnaAman(r.tengah.skor);
                htmlFase +=
                    '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
                        '<span style="font-size:1.1rem;flex-shrink:0;">' + (FASE_IKON[fase] || '🌿') + '</span>' +
                        '<div style="flex:1;min-width:0;">' +
                            '<div style="font-size:0.78rem;font-weight:600;color:#e2e8f0;">' + fase + '</div>' +
                            '<div style="font-size:0.66rem;color:#64748b;">' + r.tengah.statusCuaca + '</div>' +
                        '</div>' +
                        '<div style="text-align:right;flex-shrink:0;">' +
                            '<div style="font-size:0.68rem;color:#64748b;">' + Math.round(r.rendah.skor) + ' – <b style="color:' + wT + ';font-size:0.85rem;">' + Math.round(r.tengah.skor) + '</b> – ' + Math.round(r.tinggi.skor) + '</div>' +
                            '<div style="font-size:0.6rem;color:#64748b;">rendah – tengah – tinggi</div>' +
                        '</div>' +
                    '</div>';
            });
        } else {
            htmlFase = '<div style="font-size:0.72rem;color:#94a3b8;">Belum ada data fase — jalankan analisis di atas.</div>';
        }

        elIsi.innerHTML = htmlSlider + htmlMargin + htmlFase;

        var slider = document.getElementById('skenarioEnsoSlider');
        var nilaiEl = document.getElementById('skenarioEnsoNilai');
        if (slider) {
            slider.addEventListener('input', function () {
                if (nilaiEl) nilaiEl.textContent = parseFloat(slider.value).toFixed(1);
            });
            slider.addEventListener('change', function () {
                window._ensoSkenarioOverride = parseFloat(slider.value);
                if (typeof window.prosesAnalisisKalender === 'function') {
                    window.prosesAnalisisKalender();
                }
            });
        }
        var btnReset = document.getElementById('skenarioEnsoReset');
        if (btnReset) {
            btnReset.addEventListener('click', function () {
                window._ensoSkenarioOverride = null;
                if (typeof window.prosesAnalisisKalender === 'function') {
                    window.prosesAnalisisKalender();
                }
            });
        }
    }

    function injeksiPanel() {
        var containerUtama = document.getElementById('hasilProyeksiIklim');
        if (!containerUtama) return;

        var panel = document.getElementById('boxSkenarioEnso');
        if (!panel) {
            panel = document.createElement('details');
            panel.id = 'boxSkenarioEnso';
            panel.className = 'cuaca-accordion';
            panel.style.borderLeftColor = '#eab308';
            panel.open = true;
            panel.innerHTML =
                '<summary>🎯 Rentang Ketidakpastian &amp; Skenario ENSO</summary>' +
                '<div class="cuaca-accordion-body" id="skenarioEnsoIsi"></div>';
            containerUtama.appendChild(panel);
        }

        renderIsiPanel();
    }

    // ============================================================
    //  6. WRAP prosesAnalisisKalender — re-render panel setelah
    //  setiap analisis (termasuk saat dipicu ulang oleh slider).
    // ============================================================
    function pasangWrapProses(tick) {
        tick = tick || 0;
        if (typeof window.prosesAnalisisKalender !== 'function') {
            if (tick >= 80) { console.error('[skenario_enso] window.prosesAnalisisKalender tidak tersedia.'); return; }
            setTimeout(function () { pasangWrapProses(tick + 1); }, 100);
            return;
        }
        if (window.prosesAnalisisKalender.__skenarioEnsoWrapped) return;

        var asli = window.prosesAnalisisKalender;
        var dibungkus = async function () {
            await asli.apply(this, arguments);
            setTimeout(injeksiPanel, 150);
        };
        dibungkus.__skenarioEnsoWrapped = true;
        window.prosesAnalisisKalender = dibungkus;
    }

    // ============================================================
    //  7. INIT
    // ============================================================
    function init() {
        pasangCaptureArgumen();
        pasangOverrideENSO();
        pasangWrapProses();
        window.__skenarioEnsoIklimAktif = true;
        console.log(
            '%c✅ patch_skenario_enso_iklim.js aktif — panel Rentang Ketidakpastian & Skenario ENSO ditambahkan ke RISIKO IKLIM',
            'color:#eab308;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1900); });
    } else {
        setTimeout(init, 1900);
    }

})();
