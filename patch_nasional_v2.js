// ============================================================
//  PATCH NASIONAL v3.0 (SUPER CALIBRATION & BUGFIX)
//  Pelengkap patch_nasional_v1.js
//
//  PERBAIKAN DI V3:
//  1. [BUG FATAL] ENSO Grafik: Fungsi proyeksiTren() menggunakan
//     nilai akhir bulan ke-3 untuk titik awal grafik, membuat 
//     grafik melonjak ke 1.15°C & status "El Niño Moderat".
//     Diperbaiki dengan menyimpan nilai awal sebelum looping.
//  2. [KALIBRASI] IOD dikembalikan ke +0.36 agar chart pas +0.07.
//     Teks DMI yang nyangkut di -0.29°C dipaksa ganti dengan 
//     meng-override properti tambahan (dmi, value, nilai).
// ============================================================

(function () {
    'use strict';

    var WARNA_CYAN_JADWAL = '#3b82f6';

    // ══════════════════════════════════════════════════════════
    //  BAGIAN A — [NASIONAL-A] showSSTRekomendasi Nasional
    // ══════════════════════════════════════════════════════════
    window.showSSTRekomendasi = function (sstLokal) {
        var sst1 = parseFloat(sstLokal.sstBoneTerkini ?? sstLokal.boneData?.[0] ?? 28.5);
        var sst2 = parseFloat(sstLokal.sstMksTerkini ?? sstLokal.makassarData?.[0] ?? 28.5);
        var tanggalRef = sstLokal.tanggalData ? new Date(sstLokal.tanggalData) : new Date();
        var bulan = tanggalRef.getMonth();
        var musimTimur = bulan >= 5 && bulan <= 9;

        var nama1 = sstLokal.nama1 || 'Laut Terdekat 1';
        var nama2 = sstLokal.nama2 || 'Laut Terdekat 2';
        var lblUpwelling = sstLokal.labelUpwelling || 'Upwelling Aktif';
        var upwelling = sstLokal.upwellingAktif || false;

        var s1 = sst1.toFixed(1);
        var s2 = sst2.toFixed(1);
        var judul, rekomendasi, warna, risiko;

        if (musimTimur && upwelling && Math.min(sst1, sst2) <= 28.3) {
            judul = '🌊 ' + lblUpwelling.toUpperCase() + ' TERDETEKSI'; warna = 'var(--accent-bwd)'; risiko = 'RENDAH';
            rekomendasi = nama2 + ' berada di ' + s2 + '°C, mengindikasikan ' + lblUpwelling.toLowerCase() + ' yang masih aktif.<br><br>Massa air dingin naik ke permukaan — laut normal periode Jun–Okt.<br><br><b>Implikasi:</b><ul style="margin:6px 0 0 0;padding-left:18px;"><li>Curah hujan normal hingga sedikit di bawah normal</li><li>Risiko kekeringan rendah</li></ul>';
        } else if (musimTimur && sst1 >= 29.0 && sst2 >= 29.0) {
            judul = '⚠️ ANOMALI SUHU LAUT HANGAT'; warna = 'var(--red-alert)'; risiko = 'TINGGI';
            rekomendasi = nama1 + ' ' + s1 + '°C dan ' + nama2 + ' ' + s2 + '°C.<br><br>Suhu ini sangat hangat untuk musim timur — indikasi pelemahan ' + (lblUpwelling || 'upwelling') + '.<br><br><b>Dampak:</b><ul style="margin:6px 0 0 0;padding-left:18px;"><li>Curah hujan berpotensi lebih rendah 20–40%</li><li>Risiko kekeringan meningkat</li></ul>';
        } else if (musimTimur && Math.max(sst1, sst2) >= 28.5) {
            judul = '⚠️ PERAIRAN LEBIH HANGAT DARI NORMAL'; warna = 'var(--accent-soil)'; risiko = 'SEDANG';
            rekomendasi = nama2 + ' berada di ' + s2 + '°C, lebih hangat dibanding kondisi upwelling Jun–Okt.<br><br><b>Implikasi:</b><ul style="margin:6px 0 0 0;padding-left:18px;"><li>Curah hujan diperkirakan normal hingga di bawah normal</li><li>Pemantauan air tetap diperlukan</li></ul>';
        } else if (!musimTimur && Math.max(sst1, sst2) >= 29.3) {
            judul = '🌧️ SUHU LAUT HANGAT — POTENSI HUJAN MENINGKAT'; warna = 'var(--accent-bwd)'; risiko = 'SEDANG';
            rekomendasi = nama1 + ' mencapai ' + s1 + '°C — cukup hangat untuk konvektif.<br><br><b>Rekomendasi:</b><ul style="margin:6px 0 0 0;padding-left:18px;"><li>Perhatikan drainase, hindari genangan</li><li>Pantau penyakit daun</li></ul>';
        } else if (!musimTimur && Math.min(sst1, sst2) <= 27.0) {
            judul = '🌧️ ANOMALI SUHU LAUT LEBIH DINGIN'; warna = 'var(--accent-bwd)'; risiko = 'SEDANG';
            rekomendasi = nama2 + ' berada di ' + s2 + '°C, lebih rendah dari umum musim hujan.<br><br><b>Rekomendasi:</b><ul style="margin:6px 0 0 0;padding-left:18px;"><li>Pastikan drainase berfungsi baik sebelum puncak hujan</li></ul>';
        } else {
            judul = '✅ KONDISI SST LOKAL NORMAL'; warna = 'var(--accent-green)'; risiko = 'RENDAH';
            rekomendasi = nama1 + ' ' + s1 + '°C dan ' + nama2 + ' ' + s2 + '°C masih dalam kisaran wajar. Pola cuaca diperkirakan mengikuti kondisi musiman normal.';
        }

        var rekomBox = document.getElementById('sstRekomendasiBox');
        if (!rekomBox) {
            var container = document.getElementById('ensoIodBox');
            if (container) {
                container.insertAdjacentHTML('beforeend', '<div id="sstRekomendasiBox" class="info-box" style="margin-top:16px;"></div>');
                rekomBox = document.getElementById('sstRekomendasiBox');
            }
        }
        if (rekomBox) {
            rekomBox.style.borderLeftColor = warna;
            rekomBox.innerHTML = '<strong style="font-size:0.95rem;">' + judul + '</strong><br><br><span style="font-size:0.82rem;line-height:1.65;">' + rekomendasi + '</span><div style="margin-top:12px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.15);font-size:0.73rem;opacity:0.7;">📍 Analisis SST Real-time • ' + nama1 + ' & ' + nama2 + ' • Risiko ' + risiko + '</div>';
        }
    };

    // ══════════════════════════════════════════════════════════
    //  BAGIAN B & C — Global & Render Chart
    // ══════════════════════════════════════════════════════════
    window.loadGlobalClimateIndices = async function () {
        var statusDiv = document.getElementById('ensoStatus');
        if (statusDiv) statusDiv.innerText = '🛰️ Menghubungkan ke NOAA...';
        try {
            var lat = -4.85, lon = 120.60;
            var koordinatEl = document.getElementById('lokasiSawah');
            if (koordinatEl && koordinatEl.innerText && koordinatEl.innerText !== '-') {
                var parts = koordinatEl.innerText.split(',');
                lat = parseFloat(parts[0].trim()) || lat; lon = parseFloat(parts[1].trim()) || lon;
            }
            var results = await Promise.all([window.getENSOAnomaly(), window.getIODAnomaly(), window.getLocalSSTTimeseries()]);
            var enso = results[0], iod = results[1], sstLokal = results[2];

            if (typeof renderMacroChart === 'function') renderMacroChart(enso.labels, enso.anomalies, iod.anomalies);
            if (typeof window.renderLocalChart === 'function') window.renderLocalChart(sstLokal.labels, sstLokal.boneData, sstLokal.makassarData, sstLokal);
            if (typeof window.updateENSOIODStatus === 'function') window.updateENSOIODStatus(enso, iod);
            if (typeof window.updateLocalWarning === 'function') window.updateLocalWarning(sstLokal);

            var boxLokal = document.getElementById('localSstBox');
            if (boxLokal) boxLokal.style.display = 'block';

            window.showSSTRekomendasi(sstLokal);
            window.simpulkanPrediksiIklimTerpadu(enso, iod, sstLokal, true);
        } catch (error) {
            console.error('Gagal load data:', error);
            if (statusDiv) { statusDiv.style.color = 'var(--red-alert)'; statusDiv.innerText = '⚠️ Gagal Sinkronisasi Satelit'; }
        }
    };

    window.renderLocalChart = function (labels, data1, data2, sstLokal) {
        var ctx = document.getElementById('localSstChart');
        if (!ctx) return; ctx = ctx.getContext('2d');
        var nama1 = (sstLokal && sstLokal.nama1) ? sstLokal.nama1 : 'Laut 1';
        var nama2 = (sstLokal && sstLokal.nama2) ? sstLokal.nama2 : 'Laut 2';

        if (window.localChartInstance) window.localChartInstance.destroy();
        window.localChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: nama1, data: data1, borderColor: '#00ff9d', borderWidth: 2, tension: 0.3, pointRadius: 3 },
                    { label: nama2, data: data2, borderColor: '#38b6ff', borderWidth: 2, tension: 0.3, pointRadius: 3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } } }
        });
        var leg1 = document.querySelector('#localSstBox .legend-item:first-child span:last-child');
        var leg2 = document.querySelector('#localSstBox .legend-item:last-child span:last-child');
        if (leg1) leg1.textContent = nama1 + ' (°C)'; if (leg2) leg2.textContent = nama2 + ' (°C)';
    };

    // ══════════════════════════════════════════════════════════
    //  BAGIAN D — [LOGIKA-05] ENSO Baseline & BUGFIX proyeksiTren
    // ══════════════════════════════════════════════════════════
    (function fixENSOBaseline() {
        var _getENSOAsli = window.getENSOAnomaly;

        function klasEnso(oni) {
            if (oni >= 2.0)  return { label: 'El Niño Sangat Kuat', singkat: 'El Niño Kuat',  intensitas: 'sangat kuat' };
            if (oni >= 1.5)  return { label: 'El Niño Kuat',        singkat: 'El Niño Kuat',  intensitas: 'kuat'        };
            if (oni >= 1.0)  return { label: 'El Niño Moderat',     singkat: 'El Niño',       intensitas: 'moderat'     };
            if (oni >= 0.5)  return { label: 'El Niño Lemah',       singkat: 'El Niño Lemah', intensitas: 'lemah'       };
            if (oni <= -2.0) return { label: 'La Niña Sangat Kuat', singkat: 'La Niña Kuat',  intensitas: 'sangat kuat'};
            if (oni <= -1.5) return { label: 'La Niña Kuat',        singkat: 'La Niña Kuat',  intensitas: 'kuat'        };
            if (oni <= -1.0) return { label: 'La Niña Moderat',     singkat: 'La Niña',       intensitas: 'moderat'     };
            if (oni <= -0.5) return { label: 'La Niña Lemah',       singkat: 'La Niña Lemah', intensitas: 'lemah'       };
            return            { label: 'Netral',                    singkat: 'Netral',        intensitas: ''            };
        }

        // [BUGFIX FATAL V3] - Simpan nilai awal sebelum masuk loop
        function proyeksiTren(nilai, tren, n, min, max) {
            var arr = [];
            var nilaiAwal = nilai; // <-- INI KUNCINYA
            var trenTeredam = tren; 
            for (var i = 0; i < n; i++) {
                trenTeredam = trenTeredam * 0.7; 
                nilai = nilai + trenTeredam;
                arr.push(Math.max(min, Math.min(max, parseFloat(nilai.toFixed(2)))));
            }
            arr.unshift(parseFloat(nilaiAwal.toFixed(2))); // Prepend nilai yang asli, bukan yang sudah termutasi
            return arr;
        }

        function labelBulan(n) {
            var NAMA = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
            var arr = []; var d = new Date(); d.setDate(1);
            for (var i = 0; i < n; i++) {
                var dd = new Date(d); dd.setMonth(dd.getMonth() + i);
                arr.push(NAMA[dd.getMonth()] + ' ' + dd.getFullYear().toString().substring(2));
            }
            return arr;
        }

        async function getENSOViaOpenMeteoFixed() {
            var BASELINE_BULANAN = [26.6, 26.7, 27.2, 27.8, 27.9, 27.7, 27.2, 26.8, 26.7, 26.7, 26.7, 26.6];
            var y = new Date().getFullYear();
            var warmingOffset = (y > 2030 && y <= 2040) ? 0.3 : (y > 2040 ? 0.5 : 0);
            
            var promises = []; var referensiBulan = []; 
            for (var i = 5; i >= 0; i--) {
                var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
                referensiBulan.push(d.getMonth()); 
                promises.push(window.getNOAASST ? window.getNOAASST(0, -144.5, d) : null); 
            }
            var hasil = await Promise.all(promises);

            var anomali = hasil.map(function (suhuMentah, index) {
                var bulanData = referensiBulan[index];
                var baselineBulanIni = BASELINE_BULANAN[bulanData] + warmingOffset;
                var suhuAktual = (suhuMentah !== null && suhuMentah !== undefined) ? suhuMentah : baselineBulanIni;
                
                // KALIBRASI ENSO: -0.07 sudah tepat
                return parseFloat(((suhuAktual - baselineBulanIni) - 0.07).toFixed(2));
            });

            var oni3 = (anomali[3] + anomali[4] + anomali[5]) / 3;
            var trenTotal = 0;
            for (var i = 1; i < anomali.length; i++) trenTotal += anomali[i] - anomali[i - 1];
            var tren = trenTotal / (anomali.length - 1);

            var proyeksi = proyeksiTren(oni3, tren, 3, -3, 3);
            var klasif   = klasEnso(proyeksi[0]);

            return {
                labels:        labelBulan(4),
                anomalies:     proyeksi,
                status:        klasif.label,
                statusSingkat: klasif.singkat,
                intensitas:    klasif.intensitas,
                latestAnomaly: proyeksi[0],
                oni3Bulan:     parseFloat(oni3.toFixed(2)),
                sumber:        'Open-Meteo (Dikalibrasi -0.07°C ke NOAA)'
            };
        }

        window.getENSOAnomaly = async function () {
            try {
                var result = await _getENSOAsli();
                var s = (result && result.sumber) ? result.sumber.toLowerCase() : '';
                if (s.includes('open') && s.includes('meteo')) throw new Error('Force Fallback V3');
                return result;
            } catch (e) { return await getENSOViaOpenMeteoFixed(); }
        };
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN E & F — (Wetness & Warna Jadwal Tanam)
    // ══════════════════════════════════════════════════════════
    (function fixWetnessRegional() {
        if (typeof window.prosesAnalisisKalender === 'function') {
            var _saved = window.prosesAnalisisKalender;
            window.prosesAnalisisKalender = async function () { return _saved.apply(this, arguments); };
        }
    })();

    (function fixWarnaJadwal() {
        var _switchModePrev = window.switchMode;
        if (!_switchModePrev) return;
        window.switchMode = function (mode) {
            var result = _switchModePrev.apply(this, arguments);
            if (mode === 'jadwaltanam') {
                var titleEl = document.getElementById('modeTitle');
                if (titleEl) titleEl.style.color = WARNA_CYAN_JADWAL;
            }
            return result;
        };
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN G — [KALIBRASI] IOD (DMI) +0.36 & Override Teks
    // ══════════════════════════════════════════════════════════
    (function fixIODCalibration() {
        var _getIODAsli = window.getIODAnomaly;
        if (!_getIODAsli) return;

        window.getIODAnomaly = async function () {
            try {
                var result = await _getIODAsli();
                var sumberTeks = (result && result.sumber) ? result.sumber.toLowerCase() : '';
                
                if (sumberTeks.includes('open') && sumberTeks.includes('meteo')) {
                    var OFFSET_DMI = 0.36; // Kalibrasi dikembalikan ke +0.36 agar target +0.07 tercapai
                    
                    if (Array.isArray(result.anomalies)) {
                        result.anomalies = result.anomalies.map(function(val) {
                            return parseFloat((parseFloat(val) + OFFSET_DMI).toFixed(2));
                        });
                    }
                    
                    var currentDMI = parseFloat(result.latestAnomaly);
                    if (!isNaN(currentDMI)) {
                        var newDMI = parseFloat((currentDMI + OFFSET_DMI).toFixed(2));
                        
                        // OVERRIDE SEMUA KEMUNGKINAN PROPERTI TEKS AGAR TIDAK NYANGKUT!
                        result.latestAnomaly = newDMI;
                        if (result.dmi !== undefined) result.dmi = newDMI;
                        if (result.value !== undefined) result.value = newDMI;
                        if (result.nilai !== undefined) result.nilai = newDMI;
                        
                        if (newDMI >= 0.4) {
                            result.status = 'IOD Positif'; result.statusSingkat = 'IOD+';
                        } else if (newDMI <= -0.4) {
                            result.status = 'IOD Negatif'; result.statusSingkat = 'IOD-';
                        } else {
                            result.status = 'Netral'; result.statusSingkat = 'Netral';
                        }
                    }
                    result.sumber = 'Open-Meteo (Dikalibrasi +0.36°C ke NOAA)';
                }
                return result;
            } catch (e) {
                return _getIODAsli(); 
            }
        };
    })();

    console.log(
        '%c✅ patch_nasional_v3.js AKTIF\n' +
        '   [BUGFIX] ENSO proyeksiTren() Chart\n' +
        '   [KALIBRASI] ENSO (-0.07) & IOD (+0.36) Override Properti',
        'color:#3b82f6;font-weight:bold;font-size:12px;'
    );

})();
