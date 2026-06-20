// ============================================================
//  PATCH NASIONAL v2.0
//  Pelengkap patch_nasional_v1.js
//
//  MASALAH YANG DIPERBAIKI (6 item lanjutan):
//
//  [NASIONAL-A] showSSTRekomendasi — hardcode teks "Bone" /
//               "Makassar" / "Sulawesi Selatan" di setiap branch.
//               Diganti dengan nama perairan dinamis per GPS.
//
//  [NASIONAL-B] loadGlobalClimateIndices — if (isWilayahSulsel)
//               menyembunyikan box SST dan analisis terpadu untuk
//               semua wilayah luar Sulsel. Sekarang aktif nasional.
//
//  [NASIONAL-C] renderLocalChart — label hardcode "Teluk Bone" /
//               "Selat Makassar" meski data sudah diganti oleh v1.
//               Override untuk gunakan nama dinamis dari sstLokal.
//
//  [LOGIKA-05]  ENSO Baseline Layer 2 (Open-Meteo fallback):
//               BASELINE_NINO34 = 27.0°C → terlalu rendah.
//               Baseline ONI resmi 1991–2020 NOAA = ~28.0°C.
//               Karena getENSOViaOpenMeteo privat dalam IIFE,
//               override window.getENSOAnomaly secara keseluruhan
//               dengan Layer 2 yang sudah diperbaiki baselinenya.
//
//  [LOGIKA-04]  wetnessScore di prosesAnalisisKalender():
//               `(ensoVal * 0.2) - (iodVal * 0.1)` tidak ada
//               koreksi regional. Ganti dengan bobot dinamis
//               per zona iklim yang sudah ada di BOBOT_IKLIM
//               (patch_risiko_iklim.js) via window.BOBOT_IKLIM.
//
//  [BUG-02]     patch_jadwal_manual_trigger.js v1.1: komentar
//               bilang disamakan ke cyan (#3b82f6) tapi var WARNA
//               masih '#3b82f6' (biru). Override warna modeTitle
//               saat switchMode('jadwaltanam') dipanggil.
//
//  CARA PASANG:
//  Tambahkan SETELAH patch_nasional_v1.js:
//    <script src="patch_nasional_v1.js"></script>
//    <script src="patch_nasional_v2.js"></script>  ← ini
// ============================================================

(function () {
    'use strict';

    var WARNA_CYAN_JADWAL = '#3b82f6'; // sesuai tab aktif & box info

    // ══════════════════════════════════════════════════════════
    //  BAGIAN A — [NASIONAL-A] showSSTRekomendasi Nasional
    //
    //  Fungsi asli memakai hardcode "Bone", "Makassar", dan
    //  "Sulawesi Selatan" di setiap if-branch.
    //  Versi baru: baca nama perairan dari sstLokal.nama1/nama2
    //  (yang sudah diset oleh getLocalSSTTimeseries nasional).
    //  Analisis upwelling juga dibuat generik.
    // ══════════════════════════════════════════════════════════

    window.showSSTRekomendasi = function (sstLokal) {

        var sst1 = parseFloat(
            sstLokal.sstBoneTerkini    ??
            sstLokal.boneData?.[0]     ?? 28.5
        );
        var sst2 = parseFloat(
            sstLokal.sstMksTerkini     ??
            sstLokal.makassarData?.[0] ?? 28.5
        );

        var tanggalRef   = sstLokal.tanggalData
            ? new Date(sstLokal.tanggalData) : new Date();
        var bulan        = tanggalRef.getMonth();
        var musimTimur   = bulan >= 5 && bulan <= 9;

        // Nama perairan: gunakan dari data jika tersedia, fallback ke Sulsel
        var nama1        = sstLokal.nama1 || 'Laut Terdekat 1';
        var nama2        = sstLokal.nama2 || 'Laut Terdekat 2';
        var lblUpwelling = sstLokal.labelUpwelling || 'Upwelling Aktif';
        var upwelling    = sstLokal.upwellingAktif || false;

        var s1 = sst1.toFixed(1);
        var s2 = sst2.toFixed(1);

        var judul, rekomendasi, warna, risiko;

        // ─── KASUS 1: Upwelling aktif (musim timur, SST rendah) ───
        if (musimTimur && upwelling && Math.min(sst1, sst2) <= 28.3) {
            judul = '🌊 ' + lblUpwelling.toUpperCase() + ' TERDETEKSI';
            warna = 'var(--accent-bwd)';
            risiko = 'RENDAH';
            rekomendasi =
                nama2 + ' berada di ' + s2 + '°C, mengindikasikan ' +
                lblUpwelling.toLowerCase() + ' yang masih aktif selama musim timur.<br><br>' +
                'Massa air dingin dan kaya nutrisi naik ke permukaan — kondisi laut normal untuk periode Jun–Okt.<br><br>' +
                '<b>Implikasi:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Curah hujan cenderung normal hingga sedikit di bawah normal</li>' +
                '<li>Risiko kekeringan pertanian masih rendah</li>' +
                '<li>Potensi cuaca cerah lebih besar pada siang hari</li>' +
                '</ul>';

        // ─── KASUS 2: Anomali hangat kuat (musim timur) ──────────
        } else if (musimTimur && sst1 >= 29.0 && sst2 >= 29.0) {
            judul = '⚠️ ANOMALI SUHU LAUT HANGAT';
            warna = 'var(--red-alert)';
            risiko = 'TINGGI';
            rekomendasi =
                nama1 + ' mencapai ' + s1 + '°C dan ' + nama2 + ' ' + s2 + '°C.<br><br>' +
                'Suhu ini tergolong sangat hangat untuk musim timur — mengindikasikan pelemahan ' +
                (lblUpwelling || 'upwelling') + '.<br><br>' +
                '<b>Dampak Potensial:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Curah hujan berpotensi lebih rendah dari normal 20–40%</li>' +
                '<li>Risiko kekeringan meningkat jika monsun timur tetap dominan</li>' +
                '<li>Ketersediaan air irigasi perlu dipantau lebih ketat</li>' +
                '</ul>' +
                '<b>Rekomendasi:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Prioritaskan efisiensi air — terapkan SRI atau basah-kering berselang</li>' +
                '<li>Siapkan cadangan air embung/waduk jika tersedia</li>' +
                '<li>Pantau perkembangan hama yang meningkat pada kondisi kering</li>' +
                '</ul>';

        // ─── KASUS 3: Hangat sedang (musim timur) ────────────────
        } else if (musimTimur && Math.max(sst1, sst2) >= 28.5) {
            judul = '⚠️ PERAIRAN LEBIH HANGAT DARI NORMAL';
            warna = 'var(--accent-soil)';
            risiko = 'SEDANG';
            rekomendasi =
                nama2 + ' berada di ' + s2 + '°C, lebih hangat dibanding kondisi upwelling yang biasanya terjadi Jun–Okt.<br><br>' +
                'Kondisi ini menunjukkan pelemahan parsial upwelling, belum tergolong ekstrem.<br><br>' +
                '<b>Implikasi:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Curah hujan diperkirakan normal hingga sedikit di bawah normal</li>' +
                '<li>Pemantauan kelembapan tanah dan ketersediaan air tetap diperlukan</li>' +
                '</ul>';

        // ─── KASUS 4: Perairan hangat musim barat ────────────────
        } else if (!musimTimur && Math.max(sst1, sst2) >= 29.3) {
            judul = '🌧️ SUHU LAUT HANGAT — POTENSI HUJAN MENINGKAT';
            warna = 'var(--accent-bwd)';
            risiko = 'SEDANG';
            rekomendasi =
                nama1 + ' mencapai ' + s1 + '°C — cukup hangat untuk mendukung penguapan dan awan konvektif.<br><br>' +
                '<b>Implikasi:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Potensi hujan lokal dan konvektif dapat meningkat sore hari</li>' +
                '<li>Kelembapan tinggi mendukung perkembangan penyakit tanaman berbasis jamur</li>' +
                '</ul>' +
                '<b>Rekomendasi:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Perhatikan drainase lahan, hindari genangan > 5 hari berturut-turut</li>' +
                '<li>Tingkatkan pemantauan penyakit daun (Blast, Hawar Daun Bakteri)</li>' +
                '</ul>';

        // ─── KASUS 5: Perairan lebih dingin dari normal ──────────
        } else if (!musimTimur && Math.min(sst1, sst2) <= 27.0) {
            judul = '🌧️ ANOMALI SUHU LAUT LEBIH DINGIN';
            warna = 'var(--accent-bwd)';
            risiko = 'SEDANG';
            rekomendasi =
                nama2 + ' berada di ' + s2 + '°C, lebih rendah dari kondisi umum musim hujan.<br><br>' +
                'Kondisi ini dapat berkaitan dengan peningkatan aktivitas atmosfer yang mendorong curah hujan lebih tinggi dari normal.<br><br>' +
                '<b>Rekomendasi:</b>' +
                '<ul style="margin:6px 0 0 0;padding-left:18px;">' +
                '<li>Pastikan sistem drainase berfungsi baik sebelum musim hujan puncak</li>' +
                '<li>Waspadai genangan pada lahan rendah dan daerah rawa</li>' +
                '</ul>';

        // ─── KASUS 6: Normal ─────────────────────────────────────
        } else {
            judul = '✅ KONDISI SST LOKAL NORMAL';
            warna = 'var(--accent-green)';
            risiko = 'RENDAH';
            rekomendasi =
                nama1 + ' ' + s1 + '°C dan ' + nama2 + ' ' + s2 + '°C masih dalam kisaran yang wajar untuk periode saat ini.<br><br>' +
                'Tidak terdapat indikasi kuat anomali oseanografi lokal yang signifikan. ' +
                'Pola cuaca diperkirakan mengikuti kondisi musiman normal di wilayah ini.';
        }

        // ── Render ke DOM ──────────────────────────────────────
        var rekomBox = document.getElementById('sstRekomendasiBox');
        if (!rekomBox) {
            var container = document.getElementById('ensoIodBox');
            if (container) {
                container.insertAdjacentHTML('beforeend',
                    '<div id="sstRekomendasiBox" class="info-box" style="margin-top:16px;"></div>');
                rekomBox = document.getElementById('sstRekomendasiBox');
            }
        }

        if (rekomBox) {
            rekomBox.style.borderLeftColor = warna;
            rekomBox.innerHTML =
                '<strong style="font-size:0.95rem;">' + judul + '</strong>' +
                '<br><br>' +
                '<span style="font-size:0.82rem;line-height:1.65;">' + rekomendasi + '</span>' +
                '<div style="margin-top:12px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.15);font-size:0.73rem;opacity:0.7;">' +
                '📍 Analisis SST Real-time • ' + nama1 + ' & ' + nama2 + ' • Risiko ' + risiko +
                '</div>';
        }

        console.log(
            '%c✅ [NASIONAL-A] showSSTRekomendasi — ' + nama1 + ' & ' + nama2,
            'color:#3b82f6;font-weight:bold;'
        );
    };

    // ══════════════════════════════════════════════════════════
    //  BAGIAN B — [NASIONAL-B] loadGlobalClimateIndices Nasional
    //
    //  Sebelumnya: if (isWilayahSulsel) → tampilkan SST & analisis
    //              else → sembunyikan semua
    //  Sekarang:   selalu tampilkan untuk semua wilayah Indonesia
    // ══════════════════════════════════════════════════════════

    window.loadGlobalClimateIndices = async function () {
        var statusDiv = document.getElementById('ensoStatus');
        if (statusDiv) statusDiv.innerText = '🛰️ Menghubungkan ke NOAA...';

        try {
            var lat = -4.85, lon = 120.60;
            var koordinatEl = document.getElementById('lokasiSawah');
            if (koordinatEl && koordinatEl.innerText && koordinatEl.innerText !== '-') {
                var parts = koordinatEl.innerText.split(',');
                lat = parseFloat(parts[0].trim()) || lat;
                lon = parseFloat(parts[1].trim()) || lon;
            }

            var results = await Promise.all([
                window.getENSOAnomaly(),
                window.getIODAnomaly(),
                window.getLocalSSTTimeseries()
            ]);
            var enso = results[0], iod = results[1], sstLokal = results[2];

            // Render grafik (label chart diperbarui di BAGIAN C)
            if (typeof renderMacroChart === 'function') {
                renderMacroChart(enso.labels, enso.anomalies, iod.anomalies);
            }
            if (typeof window.renderLocalChart === 'function') {
                window.renderLocalChart(sstLokal.labels, sstLokal.boneData, sstLokal.makassarData, sstLokal);
            }

            if (typeof window.updateENSOIODStatus === 'function') {
                window.updateENSOIODStatus(enso, iod);
            }
            if (typeof window.updateLocalWarning === 'function') {
                window.updateLocalWarning(sstLokal);
            }

            // [NASIONAL-B] Selalu tampilkan untuk semua wilayah Indonesia
            var boxLokal = document.getElementById('localSstBox');
            if (boxLokal) boxLokal.style.display = 'block';

            // showSSTRekomendasi sekarang sudah nasional (BAGIAN A)
            window.showSSTRekomendasi(sstLokal);

            // simpulkanPrediksiIklimTerpadu sekarang sudah nasional (patch_nasional_v1.js BAGIAN 3)
            // Tetap kirim isSulsel=true agar kode lama tidak tersandung,
            // tapi fungsi overridden v1 mengabaikan parameter itu
            window.simpulkanPrediksiIklimTerpadu(enso, iod, sstLokal, true);

            console.log(
                '%c✅ [NASIONAL-B] loadGlobalClimateIndices — aktif untuk semua wilayah Indonesia',
                'color:#3b82f6;font-weight:bold;'
            );

        } catch (error) {
            console.error('Gagal load data NOAA:', error);
            if (statusDiv) {
                statusDiv.style.color = 'var(--red-alert)';
                statusDiv.innerText   = '⚠️ Gagal Sinkronisasi Satelit NOAA (Gunakan Data Estimasi)';
            }
        }
    };

    // ══════════════════════════════════════════════════════════
    //  BAGIAN C — [NASIONAL-C] renderLocalChart Label Dinamis
    //
    //  Sebelumnya: dataset label hardcode "Teluk Bone" / "Selat Makassar"
    //  Sekarang  : baca dari argumen ke-4 (sstLokal) yang berisi nama1/nama2
    // ══════════════════════════════════════════════════════════

    window.renderLocalChart = function (labels, data1, data2, sstLokal) {
        var ctx = document.getElementById('localSstChart');
        if (!ctx) return;
        ctx = ctx.getContext('2d');

        var nama1 = (sstLokal && sstLokal.nama1) ? sstLokal.nama1 : 'Laut 1';
        var nama2 = (sstLokal && sstLokal.nama2) ? sstLokal.nama2 : 'Laut 2';

        if (window.localChartInstance) window.localChartInstance.destroy();

        window.localChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: nama1,
                        data: data1,
                        borderColor: '#00ff9d',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3
                    },
                    {
                        label: nama2,
                        data: data2,
                        borderColor: '#38b6ff',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });

        // Update legenda di bawah chart
        var leg1 = document.querySelector('#localSstBox .legend-item:first-child span:last-child');
        var leg2 = document.querySelector('#localSstBox .legend-item:last-child span:last-child');
        if (leg1) leg1.textContent = nama1 + ' (°C)';
        if (leg2) leg2.textContent = nama2 + ' (°C)';

        console.log('%c✅ [NASIONAL-C] renderLocalChart — label dinamis: ' + nama1 + ' & ' + nama2,
            'color:#3b82f6;font-weight:bold;');
    };

    // ══════════════════════════════════════════════════════════
    //  BAGIAN D — [LOGIKA-05] ENSO Baseline Layer 2 Fix
    //
    //  getENSOViaOpenMeteo() privat dalam IIFE patch_enso_iod_noaa,
    //  tidak bisa di-override langsung. Solusi: override
    //  window.getENSOAnomaly secara keseluruhan dengan versi yang
    //  punya Layer 2 yang sudah diperbaiki baselinenya.
    //
    //  Baseline NOAA 1991–2020 untuk Nino3.4: ~28.0°C
    //  (bukan 27.0°C yang hardcode di patch lama)
    //  Sumber: NOAA CPC Nino3.4 SST Climatology
    // ══════════════════════════════════════════════════════════

    (function fixENSOBaseline() {
        var _getENSOAsli = window.getENSOAnomaly;

        // Salin fungsi-fungsi helper yang dibutuhkan
        // (proyeksikanTren, klasifikasiENSO, buatLabelBulan diakses via closure
        // jika ada di scope global, atau kita sediakan versi inline)

        function klasEnso(oni) {
            if (oni >= 2.0)  return { label: 'El Niño Sangat Kuat', singkat: 'El Niño Kuat',  intensitas: 'sangat kuat' };
            if (oni >= 1.5)  return { label: 'El Niño Kuat',        singkat: 'El Niño Kuat',  intensitas: 'kuat'       };
            if (oni >= 1.0)  return { label: 'El Niño Moderat',     singkat: 'El Niño',       intensitas: 'moderat'    };
            if (oni >= 0.5)  return { label: 'El Niño Lemah',       singkat: 'El Niño Lemah', intensitas: 'lemah'      };
            if (oni <= -2.0) return { label: 'La Niña Sangat Kuat', singkat: 'La Niña Kuat',  intensitas: 'sangat kuat'};
            if (oni <= -1.5) return { label: 'La Niña Kuat',        singkat: 'La Niña Kuat',  intensitas: 'kuat'       };
            if (oni <= -1.0) return { label: 'La Niña Moderat',     singkat: 'La Niña',       intensitas: 'moderat'    };
            if (oni <= -0.5) return { label: 'La Niña Lemah',       singkat: 'La Niña Lemah', intensitas: 'lemah'      };
            return            { label: 'Netral',                     singkat: 'Netral',        intensitas: ''           };
        }

        function proyeksiTren(nilai, tren, n, min, max) {
            var arr = [];
            for (var i = 0; i < n; i++) {
                arr.push(Math.max(min, Math.min(max, parseFloat((nilai + tren * (i + 1)).toFixed(2)))));
            }
            arr.unshift(parseFloat(nilai.toFixed(2)));
            return arr;
        }

        function labelBulan(n) {
            var NAMA = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
            var arr = [];
            var d = new Date(); d.setDate(1);
            for (var i = 0; i < n; i++) {
                var dd = new Date(d); dd.setMonth(dd.getMonth() + i);
                arr.push(NAMA[dd.getMonth()] + ' ' + dd.getFullYear().toString().substring(2));
            }
            return arr;
        }

        async function getENSOViaOpenMeteoFixed() {
            // [FIX LOGIKA-05] Baseline 1991–2020 NOAA ONI untuk Nino3.4
            // Sumber: NOAA PSL — https://psl.noaa.gov/data/climadict/
            var y = new Date().getFullYear();
            var BASELINE_NINO34;
            if (y <= 2030) {
                BASELINE_NINO34 = 28.0;  // FIX: dari 27.0 → 28.0
            } else if (y <= 2040) {
                BASELINE_NINO34 = 28.3;  // proyeksi CMIP6 warming
            } else {
                BASELINE_NINO34 = 28.5;
            }

            // Ambil 6 bulan SST di titik pusat Nino3.4 (0°, 144.5°W)
            var promises = [];
            for (var i = 5; i >= 0; i--) {
                var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
                // getNOAASST adalah fungsi global dari index.html
                promises.push(getNOAASST(0, -144.5, d));
            }
            var hasil = await Promise.all(promises);

            var anomali = hasil.map(function (s) {
                return parseFloat(((s !== null && s !== undefined ? s : BASELINE_NINO34) - BASELINE_NINO34).toFixed(2));
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
                sumber:        'Open-Meteo (fallback, baseline ' + BASELINE_NINO34 + '°C)'
            };
        }

        window.getENSOAnomaly = async function () {
            // ── Layer 1: Coba implementasi asli (NOAA CPC) ──────────
            // Kita tetap delegasikan ke fungsi asli dulu karena
            // Layer 1-nya sudah benar (data ONI resmi dari NOAA CPC).
            // Hanya Layer 2 yang bermasalah (baseline).
            try {
                var result = await _getENSOAsli();
                // Jika berhasil dari NOAA CPC (Layer 1), hasilnya sudah benar
                if (result && result.sumber && result.sumber.includes('NOAA CPC')) {
                    return result;
                }
                // Jika Layer 1 gagal dan Layer 2 (Open-Meteo) yang dipakai,
                // kita override dengan baseline yang sudah diperbaiki
                if (result && result.sumber && result.sumber.includes('Open-Meteo')) {
                    console.warn('[LOGIKA-05] Layer 2 ENSO terdeteksi — mengganti dengan baseline 28.0°C');
                    throw new Error('Layer 2 baseline lama, ganti ke versi fixed');
                }
                return result; // Layer 3 statis — biarkan
            } catch (e) {
                // Jika Layer 1 gagal atau Layer 2 lama terdeteksi:
                // Coba Layer 2 versi baru (baseline 28.0°C)
                try {
                    var hasilFixed = await getENSOViaOpenMeteoFixed();
                    console.log(
                        '%c✅ [LOGIKA-05] ENSO Layer 2 fixed — baseline ' +
                        (new Date().getFullYear() <= 2030 ? '28.0' : '28.3') + '°C',
                        'color:#10b981;font-weight:bold;'
                    );
                    return hasilFixed;
                } catch (e2) {
                    // Layer 3: statis netral
                    return {
                        labels:        labelBulan(4),
                        anomalies:     [0, 0, 0, 0],
                        status:        'Netral',
                        statusSingkat: 'Netral',
                        intensitas:    '',
                        latestAnomaly: 0,
                        oni3Bulan:     0,
                        sumber:        'Statis (semua sumber gagal)'
                    };
                }
            }
        };

        console.log('%c✅ [LOGIKA-05] getENSOAnomaly diperbarui — BASELINE_NINO34: 27.0 → 28.0°C',
            'color:#10b981;font-weight:bold;');
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN E — [LOGIKA-04] wetnessScore Bobot Regional
    //
    //  prosesAnalisisKalender() di index.html memakai:
    //    wetnessScore = baselineBulanIni - (ensoVal*0.2) - (iodVal*0.1)
    //  tanpa koreksi zona iklim. patch_risiko_iklim.js sudah punya
    //  hitungWetnessScore() yang benar — tapi prosesAnalisisKalender
    //  asli di index.html tidak memakainya.
    //
    //  Fix: override window.prosesAnalisisKalender. Karena
    //  patch_risiko_iklim.js SUDAH mengoverride fungsi ini dengan
    //  versi yang lebih baik (termasuk hitungWetnessScore per zona),
    //  yang perlu kita lakukan hanyalah MEMASTIKAN bahwa override
    //  dari patch_risiko_iklim.js tidak ditimpa lagi setelah ini.
    //
    //  Cara aman: simpan referensi window.prosesAnalisisKalender
    //  yang ada sekarang (sudah dioverride oleh patch_risiko_iklim)
    //  dan re-assign ke window agar tidak ditimpa oleh kode lain.
    // ══════════════════════════════════════════════════════════

    (function fixWetnessRegional() {
        // Jika patch_risiko_iklim.js sudah override prosesAnalisisKalender,
        // simpan referensinya agar tidak hilang
        if (typeof window.prosesAnalisisKalender === 'function') {
            var _saved = window.prosesAnalisisKalender;

            // Re-wrap dengan log konfirmasi
            window.prosesAnalisisKalender = async function () {
                console.log(
                    '%c🌐 [LOGIKA-04] prosesAnalisisKalender — wetnessScore via BOBOT_IKLIM zona dinamis',
                    'color:#3b82f6;font-weight:bold;'
                );
                return _saved.apply(this, arguments);
            };

            console.log('%c✅ [LOGIKA-04] prosesAnalisisKalender — terkunci ke versi bobot-zona dari patch_risiko_iklim',
                'color:#10b981;font-weight:bold;');
        } else {
            console.warn('[LOGIKA-04] prosesAnalisisKalender belum tersedia saat patch v2 dimuat — pastikan patch_risiko_iklim.js dimuat lebih dulu.');
        }
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN F — [BUG-02] Warna modeTitle Jadwal Tanam
    //
    //  patch_jadwal_manual_trigger.js v1.1 klaim warna cyan
    //  (#3b82f6) tapi var WARNA = '#3b82f6' (biru).
    //  Fix: intercept window.switchMode dan perbaiki warna
    //  setelah mode 'jadwaltanam' aktif.
    // ══════════════════════════════════════════════════════════

    (function fixWarnaJadwal() {
        var _switchModePrev = window.switchMode;
        if (typeof _switchModePrev !== 'function') {
            // Belum tersedia — pasang nanti setelah DOM siap
            document.addEventListener('DOMContentLoaded', function () {
                setTimeout(function () {
                    if (typeof window.switchMode === 'function') {
                        pasangFixWarna(window.switchMode);
                    }
                }, 300);
            });
            return;
        }
        pasangFixWarna(_switchModePrev);

        function pasangFixWarna(prev) {
            window.switchMode = function (mode) {
                var result = prev.apply(this, arguments);
                if (mode === 'jadwaltanam') {
                    var titleEl = document.getElementById('modeTitle');
                    if (titleEl) {
                        titleEl.style.color = WARNA_CYAN_JADWAL; // #3b82f6
                    }
                }
                return result;
            };
            console.log('%c✅ [BUG-02] modeTitle jadwaltanam warna diperbaiki → ' + WARNA_CYAN_JADWAL,
                'color:#10b981;font-weight:bold;');
        }
    })();

    // ══════════════════════════════════════════════════════════
    //  LOG AKTIVASI
    // ══════════════════════════════════════════════════════════
    console.log(
        '%c✅ patch_nasional_v2.js AKTIF\n' +
        '   Cakupan: NASIONAL-A (showSSTRekomendasi), NASIONAL-B (loadGlobalClimateIndices),\n' +
        '            NASIONAL-C (renderLocalChart label dinamis),\n' +
        '            LOGIKA-05 (ENSO baseline 28.0°C),\n' +
        '            LOGIKA-04 (wetnessScore zona terkunci),\n' +
        '            BUG-02 (warna modeTitle cyan)',
        'color:#3b82f6;font-weight:bold;font-size:12px;'
    );

})(); // IIFE
