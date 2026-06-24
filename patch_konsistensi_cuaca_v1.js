/**
 * ============================================================
 *  PATCH: Konsistensi Ikon Cuaca vs Prediksi Atmosfer
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.0
 * ============================================================
 *
 *  MASALAH YANG DIPERBAIKI:
 *  Petani bingung karena:
 *  - Prediksi Atmosfer bilang "Tidak Ada Indikasi Hujan" (skor 21)
 *  - Tapi ikon per jam dan 7 hari tampil awan hujan 🌧️
 *
 *  PENJELASAN TEKNIS:
 *  Ini BUKAN bug data — Open-Meteo memang membedakan dua hal:
 *  - weather_code = kondisi dominan awan di area (radius ~25km dari GPS)
 *  - precipitation = jumlah mm yang diprediksi jatuh di titik GPS persis
 *  Keduanya bisa berbeda untuk cuaca tropis yang sangat lokal.
 *
 *  SOLUSI:
 *  1. Tambah penjelasan konteks di kotak Prediksi Atmosfer
 *  2. Warnai ikon per jam sesuai intensitas precipitation, bukan hanya kode
 *  3. Tambah badge "Berawan Hujan" vs "Hujan Aktif" agar petani tidak salah tafsir
 *  4. Tambah ringkasan integrasi di bagian atas weatherData
 *
 *  CARA PASANG:
 *  Taruh SETELAH patch_akurasi_cuaca_v1.js di bagian bawah HTML:
 *    <script src="patch_konsistensi_cuaca_v1.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  FUNGSI BANTU
    // =========================================================================

    /**
     * Klasifikasi kondisi cuaca menjadi 4 tingkat yang mudah dipahami petani.
     * Menggabungkan weather_code (kondisi awan area) dengan
     * precipitation (intensitas titik GPS) agar tidak ada kontradiksi.
     *
     * @param {number} wCode   - weather_code dari Open-Meteo
     * @param {number} precip  - precipitation mm/jam di titik GPS
     * @returns {object}       - { ikon, label, warna, keterangan, badge }
     */
    function klasifikasiCuacaGabungan(wCode, precip) {

        // Tentukan apakah ada hujan aktual di titik GPS
        var adaHujanAktual = precip >= 0.5;

        // Tentukan apakah kode cuaca menunjukkan sistem awan hujan di sekitar area
        var areaAdaAwan = [
            51, 53, 55,             // Gerimis
            61, 63, 65,             // Hujan
            80, 81, 82,             // Hujan lokal/shower
            95, 96, 99              // Badai petir
        ].indexOf(wCode) > -1;

        // Badai petir — tampilkan apa pun intensitasnya
        if ([95, 96, 99].indexOf(wCode) > -1) {
            return {
                ikon: '⛈️',
                label: 'Potensi Badai / Petir di Area',
                warna: '#ef4444',
                keterangan: 'Sistem badai terdeteksi di sekitar wilayah. ' +
                    (adaHujanAktual
                        ? 'Hujan ' + precip.toFixed(1) + ' mm/jam di lokasi Anda.'
                        : 'Titik lokasi Anda saat ini belum terkena, tapi waspada.'),
                badge: 'BAHAYA'
            };
        }

        // Hujan lebat di titik GPS
        if (adaHujanAktual && precip >= 10) {
            return {
                ikon: '🌧️',
                label: 'Hujan Lebat di Lahan',
                warna: '#f97316',
                keterangan: 'Hujan deras ' + precip.toFixed(1) + ' mm/jam terdeteksi di koordinat sawah Anda.',
                badge: 'HUJAN LEBAT'
            };
        }

        // Hujan sedang di titik GPS
        if (adaHujanAktual && precip >= 2.5) {
            return {
                ikon: '🌧️',
                label: 'Hujan Sedang di Lahan',
                warna: '#f59e0b',
                keterangan: 'Curah hujan ' + precip.toFixed(1) + ' mm/jam di lokasi Anda.',
                badge: 'HUJAN'
            };
        }

        // Hujan ringan / gerimis di titik GPS
        if (adaHujanAktual && precip >= 0.5) {
            return {
                ikon: '🌦️',
                label: 'Gerimis / Hujan Ringan di Lahan',
                warna: '#84cc16',
                keterangan: 'Gerimis ' + precip.toFixed(1) + ' mm/jam. Lahan tersiram ringan.',
                badge: 'GERIMIS'
            };
        }

        // Ada awan hujan di area sekitar tapi TIDAK di titik GPS
        if (areaAdaAwan && !adaHujanAktual) {
            var kodeTeks = '';
            if ([51, 53, 55].indexOf(wCode) > -1) kodeTeks = 'gerimis';
            else if ([61, 63, 65].indexOf(wCode) > -1) kodeTeks = 'hujan';
            else if ([80, 81, 82].indexOf(wCode) > -1) kodeTeks = 'shower';

            return {
                ikon: '⛅',
                label: 'Awan Hujan di Sekitar Area (Belum ke Lahan)',
                warna: '#3b82f6',
                keterangan: 'Model cuaca mendeteksi sistem ' + kodeTeks + ' dalam radius ~25 km. ' +
                    'Di titik koordinat sawah Anda saat ini belum turun hujan (0.0 mm/jam). ' +
                    'Kondisi bisa berubah dalam 30–60 menit.',
                badge: 'AWAN HUJAN SEKITAR'
            };
        }

        // Berkabut
        if ([45, 48].indexOf(wCode) > -1) {
            return {
                ikon: '🌫️',
                label: 'Berkabut',
                warna: '#94a3b8',
                keterangan: 'Kabut terpantau. Kelembapan tinggi, waspada penyakit daun.',
                badge: 'KABUT'
            };
        }

        // Berawan tanpa hujan
        if ([2, 3].indexOf(wCode) > -1) {
            return {
                ikon: '☁️',
                label: 'Berawan',
                warna: '#64748b',
                keterangan: 'Tutupan awan dominan. Tidak ada hujan aktif di lokasi Anda.',
                badge: 'BERAWAN'
            };
        }

        // Cerah berawan
        if (wCode === 1) {
            return {
                ikon: '⛅',
                label: 'Cerah Berawan',
                warna: '#22c55e',
                keterangan: 'Langit cerah dengan sebagian awan. Kondisi baik untuk kerja lapangan.',
                badge: 'CERAH BERAWAN'
            };
        }

        // Cerah
        return {
            ikon: '☀️',
            label: 'Cerah',
            warna: '#eab308',
            keterangan: 'Langit cerah. Kondisi optimal untuk kerja di sawah.',
            badge: 'CERAH'
        };
    }

    // =========================================================================
    //  FUNGSI UTAMA: Perbarui tampilan Prediksi Atmosfer dengan konteks
    // =========================================================================

    function perbaruiTampilanPrediksiAtmosfer(forecast, activeIdx) {
        if (!forecast || !forecast.current || !forecast.hourly) return;

        var cur    = forecast.current;
        var hourly = forecast.hourly;
        var idxNext = Math.min(activeIdx + 1, hourly.time.length - 1);

        // Ambil data jam depan
        var precipNext = (hourly.precipitation && hourly.precipitation[idxNext]) || 0;
        var wCodeNext  = (hourly.weather_code  && hourly.weather_code[idxNext])  || cur.weather_code || 0;

        // Klasifikasi gabungan
        var info = klasifikasiCuacaGabungan(wCodeNext, precipNext);

        // Temukan elemen kotak Prediksi Atmosfer
        var elBox    = document.getElementById('prediksiHujan');
        var elTxt    = document.getElementById('hujanNext');
        if (!elBox || !elTxt) return;

        // Perbarui tampilan
        elBox.style.borderLeftColor = info.warna;
        elBox.style.background      = 'rgba(0,0,0,0.1)';
        elTxt.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<span style="font-size:1.3rem;">' + info.ikon + '</span>' +
                '<b style="color:' + info.warna + ';font-size:0.95rem;">' + info.label + '</b>' +
                '<span style="font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:5px;' +
                    'background:' + info.warna + '22;color:' + info.warna + ';border:1px solid ' + info.warna + '44;">' +
                    info.badge +
                '</span>' +
            '</div>' +
            '<div style="font-size:0.8rem;color:#94a3b8;line-height:1.6;">' +
                info.keterangan +
            '</div>' +
            '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.08);' +
                'font-size:0.72rem;color:#64748b;display:flex;flex-wrap:wrap;gap:10px;">' +
                '<span>📍 Titik GPS: <b style="color:#cbd5e1;">' + (precipNext.toFixed(1)) + ' mm/jam</b></span>' +
                '<span>🗺️ Area 25km: <b style="color:#cbd5e1;">Kode ' + wCodeNext + '</b></span>' +
                '<span>💧 Kemungkinan: <b style="color:#cbd5e1;">' +
                    ((hourly.precipitation_probability && hourly.precipitation_probability[idxNext]) || 0) + '%</b></span>' +
            '</div>' +
            '<div style="margin-top:6px;font-size:0.7rem;color:#475569;font-style:italic;">' +
                'ℹ️ Ikon awan di prakiraan = kondisi area sekitar. Angka mm/jam = curah hujan di titik sawah Anda.' +
            '</div>';
    }

    // =========================================================================
    //  FUNGSI: Tambah label penjelasan di atas prakiraan per jam
    // =========================================================================

    function tambahKeteranganPrakiraan() {
        var elHourly = document.getElementById('hourlyForecastContainer');
        if (!elHourly) return;

        // Cek apakah keterangan sudah dipasang
        var sudahAda = document.getElementById('keteranganPrakiraamJam');
        if (sudahAda) return;

        var el = document.createElement('div');
        el.id  = 'keteranganPrakiraamJam';
        el.style.cssText =
            'font-size:0.7rem;color:#475569;font-style:italic;' +
            'margin-bottom:8px;padding:8px 10px;' +
            'background:rgba(59,130,246,0.05);' +
            'border-radius:8px;border:1px solid rgba(59,130,246,0.1);' +
            'line-height:1.5;';
        el.innerHTML =
            'ℹ️ <b style="color:#3b82f6;">Catatan:</b> Ikon awan menunjukkan kondisi cuaca di area ' +
            'sekitar (radius ~25 km). Intensitas hujan aktual di sawah Anda bisa lebih kecil atau ' +
            'tidak ada sama sekali — lihat angka mm/jam di Prediksi Atmosfer di atas.';

        elHourly.parentNode.insertBefore(el, elHourly);
    }

    // =========================================================================
    //  FUNGSI: Perbarui ikon per jam agar membedakan "awan hujan area" vs "hujan aktif"
    //  Ikon 🌧️ diganti ⛅ jika precip di slot itu = 0
    // =========================================================================

    function perbaruiIkonPerJam(hourly, activeIdx) {
        if (!hourly || !hourly.time) return;

        var elHourly = document.getElementById('hourlyForecastContainer');
        if (!elHourly) return;

        var kartu = elHourly.querySelectorAll('.hourly-card');
        if (!kartu || kartu.length === 0) return;

        var KODE_HUJAN = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
        var KODE_BADAI = [95, 96, 99];

        kartu.forEach(function (kartuEl, i) {
            var idx = activeIdx + i;
            if (idx >= hourly.time.length) return;

            var wCode  = (hourly.weather_code  && hourly.weather_code[idx])  || 0;
            var precip = (hourly.precipitation  && hourly.precipitation[idx]) || 0;

            var areaHujan  = KODE_HUJAN.indexOf(wCode) > -1;
            var areaBadai  = KODE_BADAI.indexOf(wCode) > -1;
            var hujanAktual = precip >= 0.5;

            var elIkon = kartuEl.querySelector('.icon');
            if (!elIkon) return;

            // Tentukan ikon yang tepat
            var ikonBaru, tooltipBaru;
            if (areaBadai) {
                ikonBaru   = '⛈️';
                tooltipBaru = 'Potensi badai di area';
            } else if (areaHujan && hujanAktual && precip >= 10) {
                ikonBaru   = '🌧️';
                tooltipBaru = 'Hujan lebat ' + precip.toFixed(1) + ' mm/jam';
            } else if (areaHujan && hujanAktual && precip >= 2.5) {
                ikonBaru   = '🌧️';
                tooltipBaru = 'Hujan sedang ' + precip.toFixed(1) + ' mm/jam';
            } else if (areaHujan && hujanAktual) {
                ikonBaru   = '🌦️';
                tooltipBaru = 'Gerimis ' + precip.toFixed(1) + ' mm/jam';
            } else if (areaHujan && !hujanAktual) {
                // KASUS UTAMA: awan hujan di sekitar tapi tidak di titik GPS
                ikonBaru   = '⛅';
                tooltipBaru = 'Awan hujan di sekitar area, titik sawah belum terkena (0.0 mm/jam)';
            } else {
                return; // Biarkan ikon asli
            }

            elIkon.textContent = ikonBaru;
            elIkon.title       = tooltipBaru;

            // Tambah label kecil di bawah ikon jika awan hujan sekitar
            if (areaHujan && !hujanAktual) {
                var elSudahAda = kartuEl.querySelector('.label-sekitar');
                if (!elSudahAda) {
                    var labelEl = document.createElement('div');
                    labelEl.className  = 'label-sekitar';
                    labelEl.style.cssText =
                        'font-size:8px;color:#3b82f6;font-weight:700;' +
                        'margin-top:-4px;letter-spacing:0.3px;';
                    labelEl.textContent = 'SEKITAR';
                    elIkon.insertAdjacentElement('afterend', labelEl);
                }
            }
        });
    }

    // =========================================================================
    //  FUNGSI: Tambah ringkasan situasi cuaca hari ini di atas weatherData
    // =========================================================================

    function tambahRingkasanSituasi(forecast, activeIdx) {
        if (!forecast || !forecast.hourly || !forecast.daily) return;

        var sudahAda = document.getElementById('ringkasanSituasiCuaca');
        if (sudahAda) sudahAda.remove(); // Refresh jika sudah ada

        var hourly = forecast.hourly;
        var daily  = forecast.daily;

        // Hitung total precip hari ini dari data hourly (24 slot mulai activeIdx)
        var totalPrecipHariIni = 0;
        var maxPrecip = 0;
        var jamHujanPuncak = '-';
        for (var i = activeIdx; i < Math.min(activeIdx + 24, hourly.time.length); i++) {
            var p = (hourly.precipitation && hourly.precipitation[i]) || 0;
            totalPrecipHariIni += p;
            if (p > maxPrecip) {
    maxPrecip = p;
    
    // Ambil angka jamnya saja (0-23)
    var stringWaktu = (hourly.time[i] || '').split('T')[1]; 
    if (stringWaktu) {
        var angkaJam = parseInt(stringWaktu.substring(0, 2), 10);
        var keteranganWaktu = '';

        // Pembagian waktu khas Indonesia untuk aktivitas tani
        if (angkaJam >= 0 && angkaJam < 5) {
            keteranganWaktu = 'Dini Hari';
        } else if (angkaJam >= 5 && angkaJam < 10) {
            keteranganWaktu = 'Pagi';
        } else if (angkaJam >= 10 && angkaJam < 15) {
            keteranganWaktu = 'Siang';
        } else if (angkaJam >= 15 && angkaJam < 19) {
            keteranganWaktu = 'Sore';
        } else {
            keteranganWaktu = 'Malam';
        }

        // Output: "Siang (13:00)" atau "Sore (16:00)"
        jamHujanPuncak = keteranganWaktu + ' (' + stringWaktu.substring(0, 5) + ')';
    } else {
        jamHujanPuncak = '-';
    }
}

        // Kondisi dominan hari ini
        var precipHariIni = (daily.precipitation_sum && daily.precipitation_sum[0]) || totalPrecipHariIni;
        var warnaRingkasan, ikonRingkasan, statusRingkasan, saranRingkasan;

        if (maxPrecip >= 10) {
            warnaRingkasan  = '#ef4444';
            ikonRingkasan   = '🌧️';
            statusRingkasan = 'Potensi Hujan Lebat Hari Ini';
            saranRingkasan  = 'Selesaikan pekerjaan sawah sebelum jam ' + jamHujanPuncak + '. Pastikan saluran drainase terbuka.';
        } else if (maxPrecip >= 2.5) {
            warnaRingkasan  = '#f59e0b';
            ikonRingkasan   = '🌦️';
            statusRingkasan = 'Hujan Ringan–Sedang Diprediksi';
            saranRingkasan  = 'Bawa jas hujan. Hindari pemupukan jika hujan turun — pupuk akan tercuci.';
        } else if (maxPrecip >= 0.5) {
            warnaRingkasan  = '#84cc16';
            ikonRingkasan   = '🌦️';
            statusRingkasan = 'Gerimis Mungkin Terjadi';
            saranRingkasan  = 'Kondisi cukup aman. Gerimis tidak merusak, namun tunda penyemprotan pestisida.';
        } else {
            // Ada awan hujan di area (kode harian), tapi precip di GPS = 0
            var wCodeHarian = (daily.weather_code && daily.weather_code[0]) || 0;
            var KODE_AWAN_HUJAN = [51,53,55,61,63,65,80,81,82,95,96,99];
            if (KODE_AWAN_HUJAN.indexOf(wCodeHarian) > -1) {
                warnaRingkasan  = '#3b82f6';
                ikonRingkasan   = '⛅';
                statusRingkasan = 'Awan Hujan di Sekitar, Titik Sawah Relatif Aman';
                saranRingkasan  = 'Model cuaca mendeteksi awan hujan di radius 25 km. ' +
                    'Di koordinat sawah Anda, presipitasi diprediksi sangat kecil. ' +
                    'Aman untuk kerja lapangan, tapi pantau langit sekitar.';
            } else {
                warnaRingkasan  = '#10b981';
                ikonRingkasan   = '☀️';
                statusRingkasan = 'Cuaca Cerah Mendukung Kerja Lapangan';
                saranRingkasan  = 'Waktu terbaik untuk pemupukan, penyemprotan, dan pengolahan lahan.';
            }
        }

        var el = document.createElement('div');
        el.id  = 'ringkasanSituasiCuaca';
        el.style.cssText =
            'background:rgba(0,0,0,0.12);border-radius:16px;padding:14px 16px;' +
            'margin-bottom:16px;border-left:4px solid ' + warnaRingkasan + ';';
        el.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<span style="font-size:1.4rem;">' + ikonRingkasan + '</span>' +
                '<b style="color:' + warnaRingkasan + ';font-size:0.9rem;">' + statusRingkasan + '</b>' +
            '</div>' +
            '<div style="font-size:0.8rem;color:#94a3b8;line-height:1.6;">' + saranRingkasan + '</div>' +
            (maxPrecip > 0
                ? '<div style="margin-top:8px;font-size:0.72rem;color:#64748b;">' +
                    '💧 Prediksi curah hujan hari ini: <b style="color:#cbd5e1;">' +
                    totalPrecipHariIni.toFixed(1) + ' mm</b>' +
                    (jamHujanPuncak !== '-'
                        ? ' | Puncak sekitar pkl <b style="color:#cbd5e1;">' + jamHujanPuncak + '</b>'
                        : '') +
                    '</div>'
                : ''
            );

        // Sisipkan setelah kotak lokasi, sebelum prakiraan per jam
        var elHourlyTitle = document.querySelector('.forecast-title');
        if (elHourlyTitle) {
            elHourlyTitle.parentNode.insertBefore(el, elHourlyTitle);
        } else {
            var elWeatherData = document.getElementById('weatherData');
            if (elWeatherData) elWeatherData.prepend(el);
        }
    }

    // =========================================================================
    //  OBSERVER: Pantau saat data cuaca selesai dirender
    // =========================================================================

    var _sudahJalan = false;

    function jalankanSemuaPerbaikan() {
        var forecast  = window._lastForecastData;
        var activeIdx = window._activeIndexCuaca;

        if (!forecast || typeof activeIdx !== 'number') {
            // Data belum siap — coba lagi sebentar
            setTimeout(jalankanSemuaPerbaikan, 800);
            return;
        }

        if (_sudahJalan) return;
        _sudahJalan = true;

        // Jalankan semua perbaikan visual
        perbaruiTampilanPrediksiAtmosfer(forecast, activeIdx);
        tambahKeteranganPrakiraan();
        perbaruiIkonPerJam(forecast.hourly, activeIdx);
        tambahRingkasanSituasi(forecast, activeIdx);

        console.log('[patch_konsistensi] Semua perbaikan visual diterapkan.');
    }

    // Pantau elemen prakiraan per jam sebagai sinyal render selesai
    function pasangObserver() {
        var target = document.getElementById('hourlyForecastContainer');
        if (!target) { setTimeout(pasangObserver, 500); return; }

        var obs = new MutationObserver(function () {
            var kartu = target.querySelectorAll('.hourly-card');
            if (kartu.length < 3) return; // Belum cukup dirender

            // Reset flag agar bisa jalan ulang saat GPS diperbarui
            _sudahJalan = false;
            setTimeout(jalankanSemuaPerbaikan, 400);
        });

        obs.observe(target, { childList: true, subtree: true });
    }

    pasangObserver();

    console.log('✅ [patch_konsistensi_cuaca_v1] Terpasang. Menunggu data cuaca...');

})();
