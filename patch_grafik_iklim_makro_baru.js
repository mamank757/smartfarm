/**
 * ============================================================
 * patch_grafik_iklim_makro_baru.js
 * Ganti sumber data & proyeksi grafik "Iklim Makro" (tab RISIKO IKLIM)
 * ------------------------------------------------------------
 * - Sumber data: 2 endpoint GAS baru (ONI mingguan + DMI bulanan)
 *   menggantikan fetch langsung NOAA CPC/PSL via allorigins.
 * - Metode proyeksi: Holt's Damped Trend (bukan proyeksi redaman
 *   sederhana yang lama).
 * - renderMacroChart tetap dipakai (canvas #macroClimateChart),
 *   tapi tiap seri (ENSO & IOD) kini punya garis solid (aktual)
 *   + garis putus-putus (proyeksi 3 bulan) seperti dashboard baru.
 * ISI URL GAS ANDA DI SINI:
 */
window.URL_GAS_ENSO_RAW = 'https://script.google.com/macros/s/AKfycbzMth4qWgEi0DuPSMEPbjQa1jcQTWE2UiaR8gRJ-8zZTBA-4joPHgA_-7gE2_butMk/exec';
window.URL_GAS_IOD_RAW  = 'https://script.google.com/macros/s/AKfycbzUIdK6UB7y3odFvX6XiXcgZ8ccm0qiLZp60FTiYq55KiV2p_1vsJVmNrpi-F63gjRxyg/exec';

(function () {
    'use strict';

    if (window.__grafikIklimMakroBaruAktif) return;

    // ============================================================
    //  HOLT'S DAMPED TREND
    // ============================================================
    function holtDampedForecast(series, stepsAhead, opts) {
        opts = opts || {};
        var alpha = opts.alpha !== undefined ? opts.alpha : 0.35;
        var beta  = opts.beta  !== undefined ? opts.beta  : 0.15;
        var phi   = opts.phi   !== undefined ? opts.phi   : 0.85;

        var n = series.length;
        if (n === 0) return new Array(stepsAhead).fill(0);
        if (n === 1) return new Array(stepsAhead).fill(series[0]);

        var initWindow = Math.min(4, n - 1);
        var level = series[0];
        var trend = (series[initWindow] - series[0]) / initWindow;

        for (var t = 1; t < n; t++) {
            var y = series[t];
            var prevLevel = level;
            level = alpha * y + (1 - alpha) * (prevLevel + phi * trend);
            trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
        }

        var forecast = [];
        var dampSum = 0;
        for (var h = 1; h <= stepsAhead; h++) {
            dampSum += Math.pow(phi, h);
            forecast.push(level + dampSum * trend);
        }
        return forecast;
    }

    // ============================================================
    //  UTIL TANGGAL (untuk ENSO mingguan format YYYYMMDD/DDMMMYYYY)
    // ============================================================
    function parseFlexibleDate(str) {
        var s = String(str).trim().toUpperCase();
        if (/^\d{8}$/.test(s)) {
            return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
        }
        var m = s.match(/^(\d{1,2})([A-Z]{3})(\d{4})$/);
        if (m) {
            var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
            var mi = months.indexOf(m[2]);
            if (mi >= 0) return new Date(Date.UTC(+m[3], mi, +m[1]));
        }
        return null;
    }
    function addDaysFlexible(dateStr, days) {
        var dt = parseFlexibleDate(dateStr);
        if (!dt) return dateStr;
        dt.setUTCDate(dt.getUTCDate() + days);
        return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
    }
    function addMonthsToLabel(label, months) {
        var parts = label.split('-').map(Number);
        var dt = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
        dt.setUTCMonth(dt.getUTCMonth() + months);
        return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
    }

    function klasifikasiENSO(oni) {
        var status = 'Netral';
        if      (oni >= 0.5)  status = 'El Niño';
        else if (oni <= -0.5) status = 'La Niña';
        return status;
    }
    function klasifikasiIOD(dmi) {
        var status = 'Netral';
        if      (dmi >= 0.4)  status = 'IOD Positif';
        else if (dmi <= -0.4) status = 'IOD Negatif';
        return status;
    }

    // ============================================================
    //  FETCH ENSO — dari GAS baru (data mingguan Nino 3.4)
    // ============================================================
    async function getENSOAnomalyBaru() {
        try {
            var res = await fetch(window.URL_GAS_ENSO_RAW);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var text = await res.text();

            var lines = text.split('\n').filter(function (l) { return l.trim().length > 0; });
            var dataRows = lines.slice(4);

            var dates = [], seriesFull = [];
            dataRows.forEach(function (row) {
                var parts = row.trim().split(/\s+/);
                if (parts.length >= 9) {
                    dates.push(parts[0]);
                    seriesFull.push(parseFloat(parts[6]));
                }
            });

            if (seriesFull.length === 0) throw new Error('Data ENSO kosong/format tak dikenali');

            var latest = seriesFull[seriesFull.length - 1];
            var STEPS = 13; // ~3 bulan mingguan
            var forecastVals  = holtDampedForecast(seriesFull, STEPS, { alpha: 0.35, beta: 0.15, phi: 0.85 });
            var forecastDates = [];
            for (var i = 1; i <= STEPS; i++) forecastDates.push(addDaysFlexible(dates[dates.length - 1], i * 7));

            var tampilDates  = dates.slice(-20);
            var tampilSeries = seriesFull.slice(-20);

            return {
                labelsAktual   : tampilDates,
                dataAktual     : tampilSeries,
                labelsProyeksi : forecastDates,
                dataProyeksi   : forecastVals,
                labels         : tampilDates.concat(forecastDates),
                anomalies      : tampilSeries.concat(forecastVals), // kompat lama
                latestAnomaly  : latest,
                status         : klasifikasiENSO(latest),
                statusSingkat  : klasifikasiENSO(latest),
                sumber         : 'GAS ENSO Raw + Holt Damped Trend'
            };
        } catch (err) {
            console.warn('[grafik_iklim_makro_baru] ENSO gagal:', err.message);
            return {
                labelsAktual: [], dataAktual: [], labelsProyeksi: [], dataProyeksi: [],
                labels: [], anomalies: [0, 0, 0, 0],
                latestAnomaly: 0, status: 'Netral', statusSingkat: 'Netral',
                sumber: 'Statis (gagal fetch)'
            };
        }
    }

    // ============================================================
    //  FETCH IOD — dari GAS baru (format: YYYY-MM-DD,nilai)
    // ============================================================
    async function getIODAnomalyBaru() {
        try {
            // Tambahkan { redirect: 'follow' } untuk mencegah isu CORS dari GAS
            var res = await fetch(window.URL_GAS_IOD_RAW, { redirect: 'follow' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var text = await res.text();

            var lines = text.split('\n');
            var seriesFull = [], labelsFull = [];

            lines.forEach(function (line) {
                var l = line.trim();
                // Abaikan baris kosong atau baris komentar (yang diawali #)
                if (!l || l.startsWith('#')) return;

                // Pisahkan berdasarkan koma (karena output GAS formatnya Tanggal,Nilai)
                var parts = l.split(',');
                if (parts.length >= 2) {
                    var val = parseFloat(parts[1]);
                    // Pastikan nilainya valid dan bukan angka default gagal dari NOAA (-9999)
                    if (!isNaN(val) && val !== -9999) {
                        seriesFull.push(val);
                        
                        // Ambil bagian YYYY-MM dari format YYYY-MM-DD
                        var dateParts = parts[0].split('-');
                        if (dateParts.length >= 2) {
                            labelsFull.push(dateParts[0] + '-' + dateParts[1]);
                        } else {
                            labelsFull.push(parts[0]);
                        }
                    }
                }
            });

            if (seriesFull.length === 0) throw new Error('Data IOD kosong/format tak dikenali');

            var latest = seriesFull[seriesFull.length - 1];
            var STEPS = 3;
            var forecastVals   = holtDampedForecast(seriesFull, STEPS, { alpha: 0.4, beta: 0.15, phi: 0.75 });
            var forecastLabels = [];
            for (var i = 1; i <= STEPS; i++) forecastLabels.push(addMonthsToLabel(labelsFull[labelsFull.length - 1], i));

            var tampilLabels = labelsFull.slice(-18);
            var tampilSeries = seriesFull.slice(-18);

            return {
                labelsAktual   : tampilLabels,
                dataAktual     : tampilSeries,
                labelsProyeksi : forecastLabels,
                dataProyeksi   : forecastVals,
                labels         : tampilLabels.concat(forecastLabels),
                anomalies      : tampilSeries.concat(forecastVals),
                latestAnomaly  : latest,
                status         : klasifikasiIOD(latest),
                statusSingkat  : klasifikasiIOD(latest),
                sumber         : 'GAS IOD Raw + Holt Damped Trend'
            };
        } catch (err) {
            console.warn('[grafik_iklim_makro_baru] IOD gagal:', err.message);
            return {
                labelsAktual: [], dataAktual: [], labelsProyeksi: [], dataProyeksi: [],
                labels: [], anomalies: [0, 0, 0, 0],
                latestAnomaly: 0, status: 'Netral', statusSingkat: 'Netral',
                sumber: 'Statis (gagal fetch)'
            };
        }
    }
    // ============================================================
    //  PLUGIN ZONA LATAR (opsional, mempercantik seperti dashboard baru)
    // ============================================================
    var zoneBackgroundPlugin = {
        id: 'zoneBackground',
        beforeDraw: function (chart, args, options) {
            if (!options || options.upper === undefined) return;
            var ctx = chart.ctx, area = chart.chartArea;
            if (!area) return;
            var yScale = chart.scales.y;
            var yUpperPx = yScale.getPixelForValue(options.upper);
            var yLowerPx = yScale.getPixelForValue(options.lower);
            ctx.save();
            ctx.fillStyle = options.upperColor || 'rgba(215,48,39,0.08)';
            ctx.fillRect(area.left, area.top, area.right - area.left, Math.max(0, yUpperPx - area.top));
            ctx.fillStyle = options.lowerColor || 'rgba(49,54,149,0.08)';
            ctx.fillRect(area.left, yLowerPx, area.right - area.left, Math.max(0, area.bottom - yLowerPx));
            ctx.restore();
        }
    };
    if (typeof Chart !== 'undefined' && !Chart.__zoneBgRegistered) {
        Chart.register(zoneBackgroundPlugin);
        Chart.__zoneBgRegistered = true;
    }

    // ============================================================
    //  OVERRIDE renderMacroChart — aktual (solid) + proyeksi (dash)
    // ============================================================
    function renderMacroChartBaru(ensoObj, iodObj) {
        var ctx = document.getElementById('macroClimateChart');
        if (!ctx) return;
        ctx = ctx.getContext('2d');

        if (window.macroChartInstance) window.macroChartInstance.destroy();

        // Gabungkan label waktu (pakai yang lebih panjang sebagai sumbu X referensi)
        var labelsGabungan = ensoObj.labels.length >= iodObj.labels.length ? ensoObj.labels : iodObj.labels;

        function susunSeri(obj, totalLabel) {
            var nAktual = obj.labelsAktual.length;
            var nProy   = obj.labelsProyeksi.length;
            var aktual  = obj.dataAktual.concat(new Array(totalLabel - nAktual).fill(null));
            var proyeksi = new Array(Math.max(0, nAktual - 1)).fill(null)
                .concat(nAktual > 0 ? [obj.dataAktual[nAktual - 1]] : [])
                .concat(obj.dataProyeksi)
                .concat(new Array(Math.max(0, totalLabel - nAktual - nProy)).fill(null));
            return { aktual: aktual, proyeksi: proyeksi };
        }

        var totalLabel = labelsGabungan.length;
        var seriEnso = susunSeri(ensoObj, totalLabel);
        var seriIod  = susunSeri(iodObj, totalLabel);

        window.macroChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labelsGabungan,
                datasets: [
                    {
                        label: 'ENSO (aktual)',
                        data: seriEnso.aktual,
                        borderColor: '#ff4a5a',
                        backgroundColor: 'rgba(255,74,90,0.08)',
                        borderWidth: 3, tension: 0.3, fill: true, spanGaps: false, pointRadius: 2
                    },
                    {
                        label: 'ENSO (proyeksi)',
                        data: seriEnso.proyeksi,
                        borderColor: '#ff4a5a',
                        borderWidth: 2, borderDash: [6, 4],
                        tension: 0.3, fill: false, spanGaps: false, pointRadius: 0
                    },
                    {
                        label: 'IOD (aktual)',
                        data: seriIod.aktual,
                        borderColor: '#ffcc00',
                        backgroundColor: 'rgba(255,204,0,0.08)',
                        borderWidth: 3, tension: 0.3, fill: true, spanGaps: false, pointRadius: 2
                    },
                    {
                        label: 'IOD (proyeksi)',
                        data: seriIod.proyeksi,
                        borderColor: '#ffcc00',
                        borderWidth: 2, borderDash: [6, 4],
                        tension: 0.3, fill: false, spanGaps: false, pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    zoneBackground: {
                        upper: 0.5, lower: -0.5,
                        upperColor: 'rgba(215,48,39,0.06)',
                        lowerColor: 'rgba(49,54,149,0.06)'
                    }
                },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 8 }, maxRotation: 45 } }
                }
            }
        });
    }

    // ============================================================
    //  OVERRIDE loadGlobalClimateIndices bagian macro chart
    //  (biarkan bagian SST lokal tetap dari fungsi asli — kita hanya
    //   ganti cara ambil & render data ENSO/IOD makro)
    // ============================================================
    function pasangOverride(tick) {
        tick = tick || 0;
        var siap = typeof window.loadGlobalClimateIndices === 'function' &&
                   typeof window.getLocalSSTTimeseries === 'function';
        if (!siap) {
            if (tick >= 50) { console.error('[grafik_iklim_makro_baru] Dependensi tidak ditemukan.'); return; }
            setTimeout(function () { pasangOverride(tick + 1); }, 100);
            return;
        }
        if (window.loadGlobalClimateIndices.__makroBaruAktif) return;

        // Simpan agar fungsi lama (getENSOAnomaly/getIODAnomaly) tetap
        // bisa dipakai modul lain (mis. Kalender TNM) tanpa berubah.
        window.getENSOAnomalyMakroBaru = getENSOAnomalyBaru;
        window.getIODAnomalyMakroBaru  = getIODAnomalyBaru;

        window.loadGlobalClimateIndices = async function () {
            var statusDiv = document.getElementById('ensoStatus');
            if (statusDiv) statusDiv.innerText = '🛰️ Mengambil data ENSO/IOD (sumber baru)...';

            try {
                var lat = -4.85, lon = 120.60;
                var koordinatEl = document.getElementById('lokasiSawah');
                if (koordinatEl && koordinatEl.innerText !== '-') {
                    var parts = koordinatEl.innerText.split(',');
                    lat = parseFloat(parts[0].trim());
                    lon = parseFloat(parts[1].trim());
                }

                var hasil = await Promise.all([
                    getENSOAnomalyBaru(),
                    getIODAnomalyBaru(),
                    window.getLocalSSTTimeseries()
                ]);
                var enso = hasil[0], iod = hasil[1], sstLokal = hasil[2];

                renderMacroChartBaru(enso, iod);

                if (typeof window.updateENSOIODStatus === 'function') {
                    window.updateENSOIODStatus(
                        { status: enso.status, statusSingkat: enso.statusSingkat, oni3Bulan: enso.latestAnomaly, sumber: enso.sumber },
                        { status: iod.status,  statusSingkat: iod.statusSingkat,  dmi3Bulan: iod.latestAnomaly,  sumber: iod.sumber }
                    );
                }
                if (typeof window.renderLocalChart === 'function') {
                    window.renderLocalChart(sstLokal.labels, sstLokal.boneData, sstLokal.makassarData);
                }
                if (typeof window.updateLocalWarning === 'function') window.updateLocalWarning(sstLokal);

                var boxLokal = document.getElementById('localSstBox');
                var isDiIndonesia = typeof window.isWilayahSulsel === 'function' ? window.isWilayahSulsel(lat, lon) : true;
                if (isDiIndonesia) {
                    if (boxLokal) boxLokal.style.display = 'block';
                    if (typeof window.showSSTRekomendasi === 'function') window.showSSTRekomendasi(sstLokal);
                    if (typeof window.simpulkanPrediksiIklimTerpadu === 'function') window.simpulkanPrediksiIklimTerpadu(enso, iod, sstLokal, true);
                } else {
                    if (boxLokal) boxLokal.style.display = 'none';
                    if (typeof window.simpulkanPrediksiIklimTerpadu === 'function') window.simpulkanPrediksiIklimTerpadu(enso, iod, null, false);
                }

                // simpan cache agar modul lain (6-faktor, dsb) tetap kebagian data
                window._ensoDataTerkini = enso;
                window._iodDataTerkini  = iod;

            } catch (err) {
                console.error('[grafik_iklim_makro_baru] Gagal load:', err);
                if (statusDiv) {
                    statusDiv.style.color = 'var(--red-alert)';
                    statusDiv.innerText = '⚠️ Gagal memuat data ENSO/IOD (sumber baru)';
                }
            }
        };
        window.loadGlobalClimateIndices.__makroBaruAktif = true;

        console.log('%c✅ patch_grafik_iklim_makro_baru.js aktif — sumber data & proyeksi Holt Damped Trend terpasang', 'color:#ff4a5a;font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasangOverride, 900); });
    } else {
        setTimeout(pasangOverride, 900);
    }

    window.__grafikIklimMakroBaruAktif = true;
})();
