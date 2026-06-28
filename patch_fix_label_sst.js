// ============================================================
//  PATCH: FIX LABEL GRAFIK SST DINAMIS
//  Versi: 1.0.0
// ------------------------------------------------------------
//  MASALAH:
//  Label grafik "Suhu Permukaan Laut Lokal" selalu hardcode
//  "Teluk Bone" & "Selat Makassar" karena ada 3 titik masalah:
//
//  [1] renderLocalChart() di index.html → label dataset Chart.js
//      hardcode ('Teluk Bone', 'Selat Makassar'), tidak pakai nama1/nama2
//
//  [2] loadGlobalClimateIndices() → memanggil renderLocalChart()
//      tanpa meneruskan sstLokal.nama1 dan sstLokal.nama2
//
//  [3] HTML legend (2 <span>) di bawah canvas → statis, tidak ada id
//
//  SOLUSI (tanpa edit index.html):
//  A. Intercept getLocalSSTTimeseries() untuk tangkap nama1/nama2
//     tanpa API call ganda
//  B. Wrap renderLocalChart() → setelah chart dibuat, terapkan
//     nama dinamis ke dataset Chart.js dan HTML legend
// ============================================================

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────
    //  MEMORI: simpan hasil SST terakhir agar tidak double-fetch
    // ─────────────────────────────────────────────────────────
    var _hasilSstTerakhir = null;

    // ─────────────────────────────────────────────────────────
    //  HELPER: UPDATE HTML LEGEND
    //  Navigasi dari canvas → sibling berikutnya = div legend
    // ─────────────────────────────────────────────────────────
    function updateLegendHTML(n1, n2) {
        var canvas = document.getElementById('localSstChart');
        if (!canvas) return;

        // Struktur: #localSstBox > div(canvas wrapper) > canvas
        //           #localSstBox > div(legend)  ← next sibling
        var divCanvas  = canvas.parentElement;
        var legendDiv  = divCanvas ? divCanvas.nextElementSibling : null;

        // Fallback: cari div yang mengandung teks '°C' di dalam #localSstBox
        if (!legendDiv || legendDiv.children.length < 2) {
            var box = document.getElementById('localSstBox');
            if (box) {
                var semuaDiv = box.querySelectorAll('div');
                for (var i = 0; i < semuaDiv.length; i++) {
                    var d = semuaDiv[i];
                    if (d.children.length >= 2 &&
                        d.textContent.includes('\u00b0C') &&
                        !d.id) {
                        legendDiv = d;
                        break;
                    }
                }
            }
        }

        if (!legendDiv) return;

        var spans = legendDiv.children;
        if (spans[0]) {
            spans[0].innerHTML =
                '<span style="color:#00ff9d;">&#9632;</span> ' + n1 + ' (&#176;C)';
        }
        if (spans[1]) {
            spans[1].innerHTML =
                '<span style="color:#38b6ff;">&#9632;</span> ' + n2 + ' (&#176;C)';
        }
    }

    // ─────────────────────────────────────────────────────────
    //  HELPER: TERAPKAN NAMA KE CHART.JS + HTML LEGEND
    // ─────────────────────────────────────────────────────────
    function terapkanNama(n1, n2) {
        if (!n1 || !n2) return;

        // Update dataset label Chart.js
        // localChartInstance dideklarasikan dengan 'let' di scope global index.html
        // → bisa diakses langsung (bukan via window.) dari script lain
        try {
            /* eslint-disable no-undef */
            if (typeof localChartInstance !== 'undefined' &&
                localChartInstance &&
                localChartInstance.data &&
                localChartInstance.data.datasets) {
                var ds = localChartInstance.data.datasets;
                if (ds[0]) ds[0].label = n1;
                if (ds[1]) ds[1].label = n2;
                localChartInstance.update('none');
            }
            /* eslint-enable no-undef */
        } catch (e) {
            // Tidak fatal — tooltip pakai nama lama, tapi HTML legend sudah benar
        }

        // Update HTML legend di bawah canvas
        updateLegendHTML(n1, n2);

        console.log(
            '%c✅ [SST Label] Label diperbarui → "' + n1 + '" & "' + n2 + '"',
            'color:#00ff9d;'
        );
    }

    // ─────────────────────────────────────────────────────────
    //  PATCH A: INTERCEPT getLocalSSTTimeseries
    //  Tangkap nama1 & nama2 dari hasilnya tanpa fetch ulang
    // ─────────────────────────────────────────────────────────
    function pasangPatchSST() {
        if (typeof window.getLocalSSTTimeseries !== 'function') return false;
        if (window._sst_label_sst_patched) return true;

        var asli = window.getLocalSSTTimeseries;

        window.getLocalSSTTimeseries = async function () {
            var hasil = await asli.apply(this, arguments);
            _hasilSstTerakhir = hasil;  // simpan untuk dipakai di patch B
            return hasil;
        };

        window._sst_label_sst_patched = true;
        console.log('✅ [SST Label] getLocalSSTTimeseries berhasil di-intercept');
        return true;
    }

    // ─────────────────────────────────────────────────────────
    //  PATCH B: WRAP renderLocalChart
    //  Setelah chart selesai dibuat, terapkan nama dinamis
    // ─────────────────────────────────────────────────────────
    function pasangPatchRender() {
        if (typeof window.renderLocalChart !== 'function') return false;
        if (window._sst_label_render_patched) return true;

        var asli = window.renderLocalChart;

        window.renderLocalChart = function (labels, boneData, makassarData, nama1Opt, nama2Opt) {
            // Jalankan fungsi asli dulu → Chart.js instance terbentuk
            asli(labels, boneData, makassarData);

            // Pilih nama: dari parameter eksplisit, atau dari cache intercept
            var n1 = nama1Opt || (_hasilSstTerakhir && _hasilSstTerakhir.nama1);
            var n2 = nama2Opt || (_hasilSstTerakhir && _hasilSstTerakhir.nama2);

            if (n1 && n2) {
                // Sedikit delay agar Chart.js selesai render sebelum update label
                setTimeout(function () {
                    terapkanNama(n1, n2);
                }, 100);
            }
        };

        window._sst_label_render_patched = true;
        console.log('✅ [SST Label] renderLocalChart berhasil di-wrap');
        return true;
    }

    // ─────────────────────────────────────────────────────────
    //  INISIALISASI BERTAHAP
    //  Fungsi target mungkin belum ada saat patch ini dimuat,
    //  jadi coba berulang dengan interval pendek
    // ─────────────────────────────────────────────────────────
    var _percobaan   = 0;
    var MAX_PERCOBAAN = 12;
    var INTERVAL_MS  = 350;

    function cobaPasang() {
        _percobaan++;

        var okSST    = pasangPatchSST();
        var okRender = pasangPatchRender();

        if (okSST && okRender) {
            console.log(
                '%c✅ patch_fix_label_sst.js v1.0.0 AKTIF — label grafik SST kini mengikuti koordinat GPS',
                'color:#00ff9d; font-weight:bold;'
            );
            return;
        }

        if (_percobaan < MAX_PERCOBAAN) {
            setTimeout(cobaPasang, INTERVAL_MS);
        } else {
            console.warn(
                '[SST Label] Patch tidak berhasil dipasang setelah ' +
                MAX_PERCOBAAN + ' percobaan. ' +
                'Periksa apakah patch_iklim_terpadu_v1.js sudah dimuat.'
            );
        }
    }

    cobaPasang();

})();
