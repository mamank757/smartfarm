/**
 * ============================================================
 *  PATCH: Perbaikan Akurasi Prediksi Cuaca Jangka Pendek
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.0
 * ============================================================
 *
 *  CARA PASANG:
 *  1. Simpan file ini sebagai "patch_akurasi_cuaca_v1.js"
 *  2. Taruh di folder yang sama dengan file HTML utama
 *  3. Tambahkan di bagian paling BAWAH HTML, setelah semua
 *     patch lain sudah dimuat:
 *
 *     <script src="patch_akurasi_cuaca_v1.js"></script>
 *
 *  MASALAH YANG DIPERBAIKI:
 *  #1 — Skor prediksi hujan tidak membedakan intensitas
 *  #2 — Pencarian index waktu sering meleset (kritis)
 *  #3 — CAPE dari fallback wttr.in adalah nilai dummy
 *  #4 — cur.rain salah satuan, dikonversi ×4 tidak valid (kritis)
 *  #5 — Validator silang memotong skor terlalu agresif
 *  #6 — Probabilitas jam depan diambil dari index+1, bukan timestamp
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  UTILITAS INTERNAL
    // =========================================================================

    /**
     * FIX #2 — Cari index waktu terdekat berdasarkan timestamp nyata,
     * bukan string matching yang sensitif terhadap format zona waktu.
     *
     * Open-Meteo kadang mengembalikan "2026-06-24T07:00" atau
     * "2026-06-24T07:00+08:00" tergantung timezone=auto.
     * startsWith("T07:00") gagal pada format kedua → activeIndex = -1 → index 0
     * (data tengah malam). Semua angka yang tampil ke petani jadi salah jam.
     */
    function cariIndexWaktuTerdekat(hourlyTimes) {
        var sekarang = Date.now();
        var idxTerdekat = 0;
        var selisihMin = Infinity;

        for (var i = 0; i < hourlyTimes.length; i++) {
            var selisih = Math.abs(new Date(hourlyTimes[i]).getTime() - sekarang);
            if (selisih < selisihMin) {
                selisihMin = selisih;
                idxTerdekat = i;
            }
        }
        return idxTerdekat;
    }

    /**
     * FIX #6 — Cari index satu jam ke depan dari timestamp aktual,
     * bukan sekadar activeIndex + 1.
     * Jika activeIndex meleset karena masalah #2, idx+1 ikut meleset.
     */
    function cariIndexJamDepan(hourlyTimes, activeIdx) {
        if (!hourlyTimes || activeIdx < 0) return activeIdx + 1;
        var waktuSekarang = new Date(hourlyTimes[activeIdx]).getTime();
        var target = waktuSekarang + 3600000; // +1 jam dalam ms
        for (var i = activeIdx + 1; i < hourlyTimes.length; i++) {
            if (new Date(hourlyTimes[i]).getTime() >= target) return i;
        }
        return Math.min(activeIdx + 1, hourlyTimes.length - 1);
    }

    /**
     * FIX #1 & #3 & #4 & #5 & #6 — Kalkulasi skor prediksi hujan yang diperbarui.
     *
     * Perubahan utama:
     * - Skor probabilitas proporsional (0–35), bukan biner 0/40
     * - Intensitas aktual dari hourly.precipitation (mm/jam), bukan cur.rain ×4
     * - CAPE hanya dipakai jika sumber data adalah Open-Meteo asli
     * - Validator silang hanya memotong kode cerah murni (0,1), bukan kode 2,3
     * - Probabilitas jam depan diambil dari timestamp nyata (FIX #6)
     *
     * @param {object} cur         - dataForecast.current
     * @param {object} hourly      - dataForecast.hourly
     * @param {number} activeIdx   - index waktu terdekat (hasil FIX #2)
     * @param {number} cape        - nilai CAPE dari hourly.cape[activeIdx]
     * @param {string} dpSpread    - dew point spread dalam string angka
     * @param {string} sumberData  - "openmeteo" | "wttr"
     * @returns {object}           - { skor, label, warna, teks }
     */
    function hitungSkorHujanAkurat(cur, hourly, activeIdx, cape, dpSpread, sumberData) {
        var skor = 0;
        var capeValid = (sumberData === 'openmeteo');

        // --- FIX #6: ambil index jam depan dari timestamp ---
        var idxNext = cariIndexJamDepan(hourly.time, activeIdx);

        // --- Komponen 1: Probabilitas hujan jam depan (proporsional, 0–35 poin) ---
        // FIX #1: sebelumnya biner (prob ≥ 50 → +40). Sekarang proporsional.
        var prob = (hourly.precipitation_probability && hourly.precipitation_probability[idxNext]) || 0;
        skor += Math.round((prob / 100) * 35);

        // --- Komponen 2: Intensitas aktual jam depan dari hourly.precipitation ---
        // FIX #4: sebelumnya cur.rain × 4 (asumsi interval 15 menit — tidak valid).
        // hourly.precipitation sudah dalam satuan mm/jam — lebih akurat.
        var precipNext = (hourly.precipitation && hourly.precipitation[idxNext]) || 0;
        if (precipNext >= 10)       skor += 25;  // Hujan lebat
        else if (precipNext >= 2.5) skor += 15;  // Hujan sedang
        else if (precipNext >= 0.5) skor += 8;   // Hujan ringan/gerimis

        // --- Komponen 3: CAPE (hanya jika data Open-Meteo asli) ---
        // FIX #3: wttr.in mengisi cape = 500 J/kg untuk semua jam (nilai dummy).
        // Jika fallback aktif, ganti dengan estimasi dari dew point spread.
        if (capeValid) {
            if (cape >= 2500)      skor += 25;  // Potensi badai kuat
            else if (cape >= 1500) skor += 18;
            else if (cape >= 800)  skor += 10;
        } else {
            // Estimasi konservatif dari kelembapan dan dew point spread
            var spread = parseFloat(dpSpread) || 99;
            if (spread <= 1)       skor += 15;
            else if (spread <= 2)  skor += 8;
        }

        // --- Komponen 4: Kondisi atmosfer pendukung ---
        var dp = parseFloat(dpSpread) || 99;
        if (dp <= 1)                          skor += 12; // Udara jenuh
        else if (dp <= 2)                     skor += 6;
        if (cur.relative_humidity_2m >= 95)   skor += 8;
        else if (cur.relative_humidity_2m >= 88) skor += 4;

        // --- FIX #5: Validator silang — hanya potong untuk kode CERAH MURNI ---
        // Sebelumnya kode 2 (berawan sebagian) dan 3 (berawan tebal) ikut dipotong.
        // Padahal kode 3 sering menjadi prekursor hujan 30–60 menit ke depan.
        // Sekarang hanya kode 0 (cerah) dan 1 (terang berawan) yang dipotong.
        var kodeSekarang = cur.weather_code || 0;
        var tidakHujanSekarang = (cur.rain || 0) === 0 && precipNext < 0.1;
        var kodeCerahMurni = [0, 1].indexOf(kodeSekarang) > -1;

        if (kodeCerahMurni && tidakHujanSekarang && skor > 45) {
            skor = 45; // Batas atas untuk kondisi cerah murni
        }

        // Pastikan skor dalam rentang 0–100
        skor = Math.max(0, Math.min(100, skor));

        // --- Tentukan label dan warna ---
        var label, warna, teks;
        if (skor >= 75) {
            label = '⛈️ Hujan Sangat Mungkin dalam 1 Jam';
            warna = 'var(--red-alert)';
            teks  = 'Model atmosfer mendeteksi kondisi sangat kondusif untuk hujan lebat.';
        } else if (skor >= 55) {
            label = '🌧️ Potensi Hujan Sedang–Lebat';
            warna = '#f97316';
            teks  = 'Ada indikasi kuat hujan. Segera selesaikan pekerjaan di sawah.';
        } else if (skor >= 35) {
            label = '🌦️ Kemungkinan Hujan Ringan / Gerimis';
            warna = 'var(--accent-soil)';
            teks  = 'Potensi gerimis. Pantau kondisi langit sekitar.';
        } else {
            label = '🌤️ Tidak Ada Indikasi Hujan';
            warna = 'var(--accent-green)';
            teks  = 'Kondisi cuaca relatif aman untuk bekerja di lahan.';
        }

        return { skor: skor, label: label, warna: warna, teks: teks };
    }

    /**
     * FIX #4 — Hitung curah hujan per jam yang akurat untuk ditampilkan.
     * Gunakan hourly.precipitation[activeIdx] sebagai sumber utama,
     * bukan cur.rain × 4.
     */
    function getRainPerJamAkurat(cur, hourly, activeIdx) {
        // Prioritas 1: hourly.precipitation (sudah mm/jam dari Open-Meteo)
        if (hourly.precipitation && typeof hourly.precipitation[activeIdx] === 'number') {
            return hourly.precipitation[activeIdx];
        }
        // Prioritas 2: cur.rain tanpa dikalikan (bukan per-jam tapi lebih jujur)
        return cur.rain || 0;
    }

    // =========================================================================
    //  PATCH FUNGSI UTAMA loadWeather
    //  Intersep setelah data diterima, perbarui tampilan cuaca
    // =========================================================================

    /**
     * Fungsi ini dipanggil setelah renderDataCuaca() dari patch_cuaca_langsung.js
     * selesai. Kita override elemen UI yang nilainya masih salah.
     */
    function terapkanPerbaikanUI(forecast, sumberData) {
        if (!forecast || !forecast.current || !forecast.hourly) return;

        var cur    = forecast.current;
        var hourly = forecast.hourly;

        // FIX #2: Dapatkan index waktu yang benar
        var activeIdx = cariIndexWaktuTerdekat(hourly.time);

        // FIX #4: Perbarui tampilan curah hujan per jam
        var rainPerJam = getRainPerJamAkurat(cur, hourly, activeIdx);
        var elRainNow  = document.getElementById('rainNow');
        if (elRainNow) {
            elRainNow.innerHTML = rainPerJam.toFixed(1) + ' mm/jam';
        }

        // Ambil CAPE dan dew point spread
        var cape    = (hourly.cape && hourly.cape[activeIdx]) || 0;
        var dpRaw   = (cur.temperature_2m - cur.dew_point_2m);
        var dpSpread = dpRaw.toFixed(1);

        // Update tampilan dew point spread jika berbeda
        var elDp = document.getElementById('dpSpread');
        if (elDp) elDp.innerHTML = dpSpread + ' °C';

        // FIX #1 #3 #4 #5 #6: Hitung ulang skor prediksi hujan
        var hasil = hitungSkorHujanAkurat(cur, hourly, activeIdx, cape, dpSpread, sumberData || 'openmeteo');

        // Perbarui kotak prediksi atmosfer
        var elBoxHujan = document.getElementById('prediksiHujan');
        var elTxtHujan = document.getElementById('hujanNext');
        if (elBoxHujan && elTxtHujan) {
            elBoxHujan.style.display        = 'block';
            elBoxHujan.style.borderLeftColor = hasil.warna;
            elTxtHujan.innerHTML =
                '<b>' + hasil.label + '</b>' +
                '<br><small>' + hasil.teks + ' &nbsp;|&nbsp; Skor: <b>' + hasil.skor + '</b>/100</small>' +
                '<br><small style="opacity:0.6;">Prob: ' + ((hourly.precipitation_probability && hourly.precipitation_probability[cariIndexJamDepan(hourly.time, activeIdx)]) || 0) + '% &nbsp;|&nbsp; ' +
                'Precip: ' + (((hourly.precipitation && hourly.precipitation[cariIndexJamDepan(hourly.time, activeIdx)]) || 0).toFixed(1)) + ' mm/jam' +
                (sumberData === 'wttr' ? ' &nbsp;|&nbsp; <span style="color:var(--accent-soil);">⚠️ Server cadangan aktif</span>' : '') +
                '</small>';
        }

        // Simpan ke window agar fungsi lain bisa membaca index yang benar
        window._activeIndexCuaca   = activeIdx;
        window._hasilSkorHujan     = hasil;

        console.log(
            '[patch_akurasi_cuaca] FIX diterapkan.' +
            ' activeIdx=' + activeIdx +
            ' | rainPerJam=' + rainPerJam.toFixed(2) +
            ' | skor=' + hasil.skor +
            ' | dp=' + dpSpread +
            ' | sumber=' + (sumberData || 'openmeteo')
        );
    }

    // =========================================================================
    //  INTERSEP: Tangkap data forecast yang sudah di-fetch
    //  Kita pantau perubahan elemen DOM sebagai sinyal bahwa data sudah siap,
    //  lalu akses data via window._lastForecastData yang kita simpan.
    // =========================================================================

    /**
     * Wrapper untuk menyimpan data forecast ke variabel global
     * agar patch ini bisa mengaksesnya setelah render.
     * Dipasang pada window._simpanDataForecast oleh kode di bawah.
     */
    window._simpanDataForecast = function (forecast, sumber) {
        window._lastForecastData  = forecast;
        window._lastSumberCuaca   = sumber || window._sumberDataCuacaAktif || 'openmeteo';
    };

    // =========================================================================
    //  OBSERVER: Pantau elemen suhuNow sebagai sinyal data cuaca sudah dirender
    //  Begitu teks berubah dari '-' menjadi angka, jalankan perbaikan UI.
    // =========================================================================

    var _sudahPatch = false;
    var _observerJalan = false;

    function pasangObserver() {
        if (_observerJalan) return;
        var target = document.getElementById('suhuNow');
        if (!target) {
            setTimeout(pasangObserver, 500);
            return;
        }
        _observerJalan = true;

        var obs = new MutationObserver(function () {
            var teks = target.innerText || target.textContent || '';
            // Cek apakah sudah diisi angka (bukan '-' atau skeleton)
            if (!teks || teks === '-' || teks.includes('▊')) return;

            // Jalankan perbaikan UI setelah render selesai
            setTimeout(function () {
                var forecast = window._lastForecastData;
                var sumber   = window._lastSumberCuaca || window._sumberDataCuacaAktif || 'openmeteo';
                if (forecast) {
                    terapkanPerbaikanUI(forecast, sumber);
                    _sudahPatch = true;
                }
            }, 200);
        });

        obs.observe(target, { childList: true, subtree: true, characterData: true });
    }

    pasangObserver();

    // =========================================================================
    //  MONKEY-PATCH: Override fetch di loadWeather untuk menangkap data
    //  Kita wrap window.fetch agar setiap response Open-Meteo tersimpan.
    // =========================================================================

    var _fetchAsli = window.fetch;

    window.fetch = function (url, opts) {
        var promise = _fetchAsli.apply(this, arguments);

        // Hanya intersep URL Open-Meteo forecast
        if (typeof url === 'string' && url.indexOf('api.open-meteo.com/v1/forecast') > -1) {
            return promise.then(function (response) {
                // Clone response agar body bisa dibaca dua kali
                var responseClone = response.clone();
                responseClone.json().then(function (data) {
                    if (data && data.hourly && data.current) {
                        window._lastForecastData = data;
                        window._lastSumberCuaca  = 'openmeteo';
                        // Reset flag agar observer menjalankan ulang perbaikan
                        _sudahPatch = false;
                    }
                }).catch(function () {});
                return response;
            });
        }

        // Tangkap fallback wttr.in juga
        if (typeof url === 'string' && url.indexOf('wttr.in') > -1) {
            return promise.then(function (response) {
                var responseClone = response.clone();
                responseClone.json().then(function (data) {
                    if (data && data.current_condition) {
                        // Data wttr — tandai sebagai fallback
                        window._lastSumberCuaca = 'wttr';
                        _sudahPatch = false;
                    }
                }).catch(function () {});
                return response;
            });
        }

        return promise;
    };

    // =========================================================================
    //  API PUBLIK — Bisa dipanggil manual dari konsol browser untuk debugging
    // =========================================================================

    /**
     * Panggil ini dari konsol browser untuk melihat diagnosis real-time:
     *   window.diagnosisCuaca()
     */
    window.diagnosisCuaca = function () {
        var forecast = window._lastForecastData;
        if (!forecast) {
            console.warn('[patch_akurasi] Belum ada data forecast. Sinkronkan GPS dulu.');
            return;
        }
        var cur      = forecast.current;
        var hourly   = forecast.hourly;
        var activeIdx = cariIndexWaktuTerdekat(hourly.time);
        var idxNext   = cariIndexJamDepan(hourly.time, activeIdx);
        var cape      = (hourly.cape && hourly.cape[activeIdx]) || 0;
        var dp        = (cur.temperature_2m - cur.dew_point_2m).toFixed(1);
        var sumber    = window._lastSumberCuaca || 'openmeteo';
        var hasil     = hitungSkorHujanAkurat(cur, hourly, activeIdx, cape, dp, sumber);

        console.group('[patch_akurasi] Diagnosis Cuaca Real-Time');
        console.log('Waktu server jam terdekat :', hourly.time[activeIdx]);
        console.log('Index aktif (FIX #2)       :', activeIdx);
        console.log('Index jam depan (FIX #6)   :', idxNext);
        console.log('Waktu jam depan            :', hourly.time[idxNext]);
        console.log('cur.rain (raw)             :', cur.rain, 'mm');
        console.log('hourly.precipitation aktif :', (hourly.precipitation && hourly.precipitation[activeIdx]) || 'N/A', 'mm/jam');
        console.log('hourly.precipitation depan :', (hourly.precipitation && hourly.precipitation[idxNext]) || 'N/A', 'mm/jam');
        console.log('Prob hujan jam depan       :', (hourly.precipitation_probability && hourly.precipitation_probability[idxNext]) || 0, '%');
        console.log('CAPE                       :', cape, 'J/kg');
        console.log('Dew point spread           :', dp, '°C');
        console.log('Kelembapan                 :', cur.relative_humidity_2m, '%');
        console.log('Weather code sekarang      :', cur.weather_code);
        console.log('Sumber data                :', sumber);
        console.log('--- Hasil FIX ---');
        console.log('Skor prediksi hujan        :', hasil.skor, '/ 100');
        console.log('Label                      :', hasil.label);
        console.groupEnd();

        return hasil;
    };

    console.log('✅ [patch_akurasi_cuaca_v1] Semua 6 fix berhasil dipasang.');
    console.log('   Ketik window.diagnosisCuaca() di konsol untuk debug real-time.');

})();
