/**
 * ============================================================
 *  PATCH: Menu Risiko Cuaca — Tampil Langsung via BTS,
 *         Sinkron GPS untuk Data Akurat + Risiko Lengkap
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 2.4 (FIX: nilai input tanggal/varietas tidak hilang)
 * ============================================================
 *
 *  BUG YANG DIPERBAIKI (v2.3 → v2.4):
 *  renderUITombolGPS() menimpa innerHTML #gpsPrompt secara total,
 *  menyebabkan nilai #tglTanamCuaca & #umurVarietasCuaca terhapus
 *  sebelum analisisFaseTanaman() sempat membacanya → umurHari = 0.
 *
 *  FIX:
 *  1. Baca & simpan nilai input SEBELUM innerHTML diganti.
 *  2. Restore nilai tersebut SETELAH render selesai.
 *  3. localStorage hanya dipakai sebagai fallback (tidak timpa input user).
 *  4. Setiap kali user mengubah input, nilai disimpan ke state lokal patch
 *     sehingga survive melewati render ulang berikutnya.
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONSTANTA & STATE
    // =========================================================================

    const LOK_FALLBACK = {
        lat: -3.9264,
        lon: 120.0275,
        label: 'Kab. Wajo, Sulawesi Selatan',
        akurasi: 'fallback'
    };

    const state = {
        koordinat: null,
        dataForecast: null,
        dataArchive: null,
        sedangMemuat: false,
        gpsAktif: false,
        btsSudahDicoba: false,
        // ── BARU: simpan nilai input agar survive render ulang ──
        inputTglTanam:    '',
        inputUmurVar:     'sedang',
    };

    // =========================================================================
    //  UTILITAS
    // =========================================================================

    async function fetchRetry(url, maxCoba, jedaMs) {
        maxCoba = maxCoba || 3;
        jedaMs  = jedaMs  || 1500;
        for (var i = 0; i < maxCoba; i++) {
            try {
                var ctrl = new AbortController();
                var t = setTimeout(function(){ ctrl.abort(); }, 12000);
                var res = await fetch(url, { signal: ctrl.signal });
                clearTimeout(t);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.json();
            } catch (e) {
                if (i < maxCoba - 1) await new Promise(function(r){ setTimeout(r, jedaMs); });
                else throw e;
            }
        }
    }

    function tglMinus(hari) {
        var d = new Date();
        d.setDate(d.getDate() - hari);
        return d.toISOString().split('T')[0];
    }

    async function reverseGeocode(lat, lon) {
        try {
            var res = await fetch(
                'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon,
                { headers: { 'User-Agent': 'SmartFarming-PPLWajo/2.0' } }
            );
            if (!res.ok) return null;
            var d = await res.json();
            var a = d.address || {};
            var desa = a.village || a.suburb || a.hamlet || a.town || 'Lokasi';
            var kab  = a.county  || a.city   || a.municipality || '';
            return desa + ', Kab. ' + kab;
        } catch (e) {
            return null;
        }
    }

    // =========================================================================
    //  HELPER: baca nilai input ke state (panggil sebelum render ulang)
    // =========================================================================

    function simpanNilaiInput() {
        var tglEl = document.getElementById('tglTanamCuaca');
        var varEl = document.getElementById('umurVarietasCuaca');
        if (tglEl && tglEl.value) state.inputTglTanam = tglEl.value;
        if (varEl && varEl.value) state.inputUmurVar  = varEl.value;
    }

    // =========================================================================
    //  HELPER: pasang nilai input ke DOM (panggil setelah render ulang)
    // =========================================================================

    function restoreNilaiInput() {
        var tglEl = document.getElementById('tglTanamCuaca');
        var varEl = document.getElementById('umurVarietasCuaca');

        // Prioritas 1: nilai di state (dari input user sesi ini)
        if (tglEl && state.inputTglTanam) {
            tglEl.value = state.inputTglTanam;
        }
        if (varEl && state.inputUmurVar) {
            varEl.value = state.inputUmurVar;
        }

        // Prioritas 2: localStorage — hanya jika state masih kosong
        try {
            var la = JSON.parse(localStorage.getItem('sf_lahan_aktif') || 'null');
            if (la) {
                if (tglEl && !tglEl.value && la.tglTanam)     tglEl.value = la.tglTanam;
                if (varEl && varEl.value === 'sedang' && la.varietasUmur) varEl.value = la.varietasUmur;
            }
        } catch(e) {}

        // Pasang event listener agar perubahan user langsung tersimpan ke state
        pasangListenerInput();
    }

    // =========================================================================
    //  HELPER: pasang event listener di input (idempotent)
    // =========================================================================

    function pasangListenerInput() {
        var tglEl = document.getElementById('tglTanamCuaca');
        var varEl = document.getElementById('umurVarietasCuaca');

        if (tglEl && !tglEl._patchListened) {
            tglEl._patchListened = true;
            tglEl.addEventListener('change', function() {
                state.inputTglTanam = tglEl.value;
            });
            tglEl.addEventListener('input', function() {
                state.inputTglTanam = tglEl.value;
            });
        }

        if (varEl && !varEl._patchListened) {
            varEl._patchListened = true;
            varEl.addEventListener('change', function() {
                state.inputUmurVar = varEl.value;
            });
        }
    }

    // =========================================================================
    //  TAHAP 1: DAPATKAN LOKASI VIA BTS / IP GEOLOCATION
    // =========================================================================

    async function dapatkanLokasiVIABTS() {
        if (window._koordinatTerakhir) {
            var pos = window._koordinatTerakhir;
            return {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                label: 'Lokasi Tersimpan (GPS Sebelumnya)',
                akurasi: 'gps'
            };
        }

        try {
            var pos = await new Promise(function(resolve, reject) {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 8000,
                    maximumAge: 300000
                });
            });
            return {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                label: 'Estimasi Lokasi (Jaringan Seluler)',
                akurasi: 'bts'
            };
        } catch (e) {}

        var ipSources = [
            async function() {
                var d = await fetchRetry('https://ipapi.co/json/', 1, 0);
                if (d.latitude && d.longitude) {
                    return {
                        lat: parseFloat(d.latitude),
                        lon: parseFloat(d.longitude),
                        label: (d.city || '') + ', ' + (d.region || 'Indonesia'),
                        akurasi: 'ip'
                    };
                }
                return null;
            },
            async function() {
                var d = await fetchRetry('https://ip-api.com/json/?fields=lat,lon,city,regionName', 1, 0);
                if (d.lat && d.lon) {
                    return {
                        lat: parseFloat(d.lat),
                        lon: parseFloat(d.lon),
                        label: (d.city || '') + ', ' + (d.regionName || 'Indonesia'),
                        akurasi: 'ip'
                    };
                }
                return null;
            }
        ];

        for (var i = 0; i < ipSources.length; i++) {
            try {
                var hasil = await ipSources[i]();
                if (hasil) return hasil;
            } catch (e) {}
        }

        return Object.assign({}, LOK_FALLBACK);
    }

    // =========================================================================
    //  TAHAP 2: FETCH DATA CUACA OPEN-METEO
    // =========================================================================

    async function fetchDataCuaca(lat, lon) {
        var urlForecast =
            'https://api.open-meteo.com/v1/forecast' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&current=rain,temperature_2m,relative_humidity_2m,dew_point_2m,' +
            'wind_speed_10m,wind_direction_10m,surface_pressure,weather_code' +
            '&hourly=precipitation_probability,precipitation,temperature_850hPa,' +
            'cape,temperature_2m,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
            '&forecast_days=7&timezone=auto';

        var urlArchive =
            'https://archive-api.open-meteo.com/v1/archive' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&start_date=' + tglMinus(30) + '&end_date=' + tglMinus(1) +
            '&daily=precipitation_sum&timezone=auto';

        var results = await Promise.all([
            fetchRetry(urlForecast),
            fetchRetry(urlArchive).catch(function() { return { daily: { precipitation_sum: [] } }; })
        ]);

        return { forecast: results[0], archive: results[1] };
    }

    // =========================================================================
    //  RENDER DATA CUACA
    // =========================================================================

    function cuacaDariKode(code) {
        if (code === 0)                              return { ikon: '☀️', teks: 'Cerah' };
        if ([1,2,3].indexOf(code) > -1)             return { ikon: '☁️', teks: 'Berawan' };
        if ([45,48].indexOf(code) > -1)             return { ikon: '🌫️', teks: 'Berkabut' };
        if ([51,53,55,61,63,80,81].indexOf(code) > -1) return { ikon: '🌧️', teks: 'Hujan Ringan' };
        if ([65,82].indexOf(code) > -1)             return { ikon: '🌧️', teks: 'Hujan Lebat' };
        if ([95,96,99].indexOf(code) > -1)          return { ikon: '⛈️', teks: 'Badai Petir' };
        return { ikon: '⛅', teks: 'Berawan' };
    }

    function tampilkanSkeleton() {
        var hourlyBox = document.getElementById('hourlyForecastContainer');
        if (hourlyBox) {
            hourlyBox.innerHTML = Array(8).fill(0).map(function() {
                return '<div class="hourly-card" style="min-width:75px;opacity:0.5;">' +
                    '<div style="background:#1e2f45;border-radius:6px;height:11px;width:36px;margin:0 auto 8px;"></div>' +
                    '<div style="background:#1e2f45;border-radius:50%;height:28px;width:28px;margin:0 auto 8px;"></div>' +
                    '<div style="background:#1e2f45;border-radius:6px;height:13px;width:34px;margin:0 auto;"></div>' +
                    '</div>';
            }).join('');
        }
        var dailyBox = document.getElementById('dailyForecastContainer');
        if (dailyBox) {
            dailyBox.innerHTML = Array(7).fill(0).map(function() {
                return '<div class="daily-item">' +
                    '<div style="background:#1e2f45;border-radius:6px;height:13px;width:55px;"></div>' +
                    '<div style="background:#1e2f45;border-radius:6px;height:18px;width:22px;margin:0 auto;"></div>' +
                    '<div style="background:#1e2f45;border-radius:6px;height:13px;width:65px;margin-left:auto;"></div>' +
                    '</div>';
            }).join('');
        }
        ['rainNow','rainMonthly','suhuNow','humidityNow','windNow','pressNow',
         'tempUpper','dpSpread','capeVal','windDir'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = '<span style="background:#1e2f45;border-radius:4px;display:inline-block;width:65px;height:13px;"></span>';
        });
    }

    function renderDataCuaca(forecast, archive, koordinat) {
        var cur    = forecast.current;
        var hourly = forecast.hourly;
        var daily  = forecast.daily;

        var now = new Date();
        var waktuStr =
            now.getFullYear() + '-' +
            String(now.getMonth()+1).padStart(2,'0') + '-' +
            String(now.getDate()).padStart(2,'0') + 'T' +
            String(now.getHours()).padStart(2,'0') + ':00';
        var idx = hourly.time.findIndex(function(t) { return t.startsWith(waktuStr); });
        if (idx === -1) idx = hourly.time.findIndex(function(t) { return new Date(t) >= now; });
        if (idx === -1) idx = 0;

        // ── Lokasi ───────────────────────────────────────────────────────────
        var lokasiEl = document.getElementById('lokasiSawah');
        var alamatEl = document.getElementById('alamatDesa');
        if (lokasiEl) lokasiEl.innerText = koordinat.lat.toFixed(5) + ', ' + koordinat.lon.toFixed(5);
        if (alamatEl) {
            var warnaBadge = koordinat.akurasi === 'gps' ? '#10b981' : (koordinat.akurasi === 'bts' ? '#f59e0b' : '#64748b');
            var ikonBadge  = koordinat.akurasi === 'gps' ? '🛰️' : '📡';
            var labelBadge = koordinat.akurasi === 'gps'
                ? 'GPS Akurat'
                : (koordinat.akurasi === 'bts' ? 'Lokasi dari sinyal BTS/WiFi' : 'Estimasi Wilayah');
            alamatEl.innerHTML =
                '<b>' + koordinat.label + '</b>' +
                '<span style="display:inline-block;margin-left:8px;font-size:0.7rem;padding:2px 8px;border-radius:6px;' +
                'background:rgba(255,255,255,0.08);color:' + warnaBadge + ';">' +
                ikonBadge + ' ' + labelBadge + '</span>';
        }

        // ── Prakiraan Per Jam ────────────────────────────────────────────────
        var hourlyBox = document.getElementById('hourlyForecastContainer');
        if (hourlyBox) {
            hourlyBox.innerHTML = '';
            for (var i = idx; i < idx + 12 && i < hourly.time.length; i++) {
                var jam   = hourly.time[i].split('T')[1].substring(0,5);
                var cuaca = cuacaDariKode(hourly.weather_code[i]);
                var suhu  = hourly.temperature_2m[i].toFixed(0);
                hourlyBox.innerHTML +=
                    '<div class="hourly-card">' +
                    '<div class="time">' + jam + '</div>' +
                    '<div class="icon" title="' + cuaca.teks + '">' + cuaca.ikon + '</div>' +
                    '<div class="temp">' + suhu + '°C</div>' +
                    '</div>';
            }
        }

        // ── Prakiraan 7 Hari ─────────────────────────────────────────────────
        var dailyBox = document.getElementById('dailyForecastContainer');
        if (dailyBox) {
            dailyBox.innerHTML = '';
            var HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
            daily.time.forEach(function(tgl, j) {
                var d    = new Date(tgl);
                var hari = j === 0 ? 'Hari Ini' : HARI[d.getDay()];
                var c    = cuacaDariKode(daily.weather_code[j]);
                var maks = daily.temperature_2m_max[j].toFixed(0);
                var min  = daily.temperature_2m_min[j].toFixed(0);
                dailyBox.innerHTML +=
                    '<div class="daily-item">' +
                    '<div class="day">' + hari + '</div>' +
                    '<div class="icon" title="' + c.teks + '">' + c.ikon + '</div>' +
                    '<div class="temp-range">' + min + '°/' + maks + '°C</div>' +
                    '</div>';
            });
        }

        // ── Parameter Real-Time ──────────────────────────────────────────────
        var dp   = (cur.temperature_2m - cur.dew_point_2m).toFixed(1);
        var cape = hourly.cape ? (hourly.cape[idx] || 0) : 0;
        var t850 = hourly.temperature_850hPa ? hourly.temperature_850hPa[idx] : '-';

        function set(id, val) { var el = document.getElementById(id); if (el) el.innerHTML = val; }
        set('dpSpread',    dp + ' °C');
        set('suhuNow',     cur.temperature_2m + ' °C');
        set('humidityNow', cur.relative_humidity_2m + '%');
        set('windNow',     cur.wind_speed_10m + ' km/jam');
        set('pressNow',    cur.surface_pressure + ' hPa');
        set('tempUpper',   t850 + ' °C');

        var capeEl = document.getElementById('capeVal');
        if (capeEl) {
            var st = cape > 2500 ? '‼️ EKSTREM' : (cape > 1000 ? '⚠️ WASPADA' : '✅ STABIL');
            capeEl.innerHTML = cape + ' J/kg<br><small>Status: ' + st + '</small>';
        }

        var listHujan    = (archive.daily || {}).precipitation_sum || [];
        var totalBulanan = listHujan.reduce(function(t,v){ return t+(v||0); }, 0);
        set('rainNow',     (cur.rain || 0).toFixed(1) + ' mm/jam');
        set('rainMonthly', '<b>' + totalBulanan.toFixed(1) + ' mm</b>');

        var ARAH  = ['Utara','Timur Laut','Timur','Tenggara','Selatan','Barat Daya','Barat','Barat Laut'];
        var dirEl = document.getElementById('windDir');
        if (dirEl) {
            var arahIdx = Math.round(cur.wind_direction_10m / 45) % 8;
            dirEl.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;">' +
                '<span style="transform:rotate(' + (cur.wind_direction_10m + 180) + 'deg)">⬆️</span>' +
                '<span>Dari ' + ARAH[arahIdx] + '</span></div>';
        }

        // ── Prediksi Atmosfer ────────────────────────────────────────────────
        var rainScore = 0;
        var prob = hourly.precipitation_probability;
        if (prob && ((prob[idx + 1] !== undefined ? prob[idx + 1] : 0) >= 30)) rainScore += 40;
        if (cape >= 1000)                        rainScore += 30;
        if (parseFloat(dp) <= 2)                 rainScore += 20;
        if (cur.relative_humidity_2m >= 90)      rainScore += 10;

        var boxHujan = document.getElementById('prediksiHujan');
        var txtHujan = document.getElementById('hujanNext');
        if (boxHujan && txtHujan) {
            boxHujan.style.display = 'block';
            if (rainScore >= 70) {
                txtHujan.innerHTML = '⛈️ <b>Hujan Sangat Mungkin</b><br><small>(Skor: ' + rainScore + '/100)</small>';
                boxHujan.style.borderLeftColor = 'var(--red-alert)';
            } else if (rainScore >= 40) {
                txtHujan.innerHTML = '🌦️ <b>Potensi Hujan Lokal</b><br><small>(Skor: ' + rainScore + '/100)</small>';
                boxHujan.style.borderLeftColor = 'var(--accent-soil)';
            } else {
                txtHujan.innerHTML = '🌤️ <b>Cerah / Berawan</b><br><small>(Skor: ' + rainScore + '/100)</small>';
                boxHujan.style.borderLeftColor = 'var(--accent-green)';
            }
        }

        // ── Radar Satelit ────────────────────────────────────────────────────
        var radarEl = document.getElementById('radarMap');
        if (radarEl) radarEl.src = 'https://mamank757.github.io/peta?lat=' + koordinat.lat + '&lon=' + koordinat.lon;

        return { cur: cur, dp: dp, cape: cape, idx: idx };
    }

    // =========================================================================
    //  RENDER BOX RISIKO (hanya setelah GPS aktif)
    // =========================================================================

    function hapusBoxRisiko() {
        document.querySelectorAll('#weatherData .info-box-risiko').forEach(function(el){ el.remove(); });
        document.querySelectorAll('#weatherData .info-box-dynamic').forEach(function(el){ el.remove(); });
        var boxBlast = document.getElementById('boxBlastRisk');
        if (boxBlast) boxBlast.style.display = 'none';
        var lokal = document.getElementById('localSstBox');
        if (lokal) lokal.style.display = 'none';
    }

    function renderBannerTungguGPS() {
        hapusBoxRisiko();
        var weatherData = document.getElementById('weatherData');
        if (!weatherData) return;
        weatherData.insertAdjacentHTML('beforeend',
            '<div id="bannerTungguGPS" class="info-box info-box-risiko"' +
            ' style="border-left-color:#3b82f6;background:rgba(59,130,246,0.05);' +
            'margin-top:16px;text-align:center;animation:fadeInUpCuaca 0.5s ease;">' +
            '<div style="font-size:2rem;margin-bottom:10px;">🛰️</div>' +
            '<div style="font-size:0.9rem;font-weight:700;color:#3b82f6;margin-bottom:8px;">Analisis Risiko Penyakit & Hama Sawah</div>' +
            '<div style="font-size:0.8rem;color:#64748b;line-height:1.8;margin-bottom:14px;">' +
            'Tekan <b style="color:#3b82f6;">SINKRONKAN GPS/SATELIT UTK LOKASI AKURAT</b> di atas untuk mengaktifkan:<br>' +
            '<span style="color:#ef4444;">⚠️ Risiko Blast Padi</span> &nbsp;•&nbsp; <span style="color:#ef4444;">⚠️ Hawar Pelepah</span><br>' +
            '<span style="color:#f59e0b;">🐛 Penggerek Batang</span> &nbsp;•&nbsp; <span style="color:#f59e0b;">🪳 Wereng Batang Coklat</span><br>' +
            '<span style="color:#10b981;">🌾 Tungro (Virus)</span> &nbsp;•&nbsp; <span style="color:#10b981;">🐀 Tikus Sawah</span><br>' +
            '<span style="color:#d946ef;">🌱 Fase Tanaman Saat Ini</span><br>' +
            '<span style="color:#38b6ff;">📈 Proyeksi Iklim ENSO / IOD / SST</span>' +
            '</div>' +
            '<div style="font-size:0.7rem;color:#475569;">GPS diperlukan agar analisis disesuaikan dengan kondisi mikro lokasi sawah Anda.</div>' +
            '</div>'
        );
    }

    function renderSemuaRisikoGPS(cur, dp) {
        hapusBoxRisiko();
        var banner = document.getElementById('bannerTungguGPS');
        if (banner) banner.remove();

        var boxBlast = document.getElementById('boxBlastRisk');
        if (boxBlast) {
            boxBlast.style.display = 'block';
            if (typeof window.analyzeDiseaseRisk === 'function') {
                window.analyzeDiseaseRisk(cur, dp);
            }
        }

        var weatherData = document.getElementById('weatherData');
        if (!weatherData) return;

        // ── KUNCI FIX: pastikan nilai input sudah ter-restore sebelum analisis ──
        restoreNilaiInput();

        var fase = typeof window.analisisFaseTanaman === 'function'
            ? window.analisisFaseTanaman()
            : { fase: 'Belum diset', umurHari: 0, musim: '-' };

        function boksRisiko(judul, r) {
            return '<div class="info-box info-box-risiko" style="border-left-color:' + r.warna + ';margin-top:15px;animation:fadeInUpCuaca 0.4s ease;">' +
                '<strong>' + judul + '</strong><br>' +
                '<div style="font-size:1.1rem;font-weight:800;color:' + r.warna + ';">' + r.level + '</div>' +
                '<p style="margin:5px 0;opacity:0.9;">' + r.detail + '</p>' +
                '<div style="background:rgba(255,255,255,0.02);padding:8px;border-radius:6px;"><b>💡 Rekomendasi:</b> ' + r.saran + '</div>' +
                '</div>';
        }

        weatherData.insertAdjacentHTML('beforeend',
            '<div class="info-box info-box-risiko" style="border-left-color:var(--accent-bwd);margin-top:15px;animation:fadeInUpCuaca 0.4s ease;">' +
            '<strong>🌱 Fase Tanaman Saat Ini</strong><br>' +
            '<div style="font-size:1rem;font-weight:700;color:var(--accent-bwd);">' + fase.fase + '</div>' +
            '<small>' + fase.musim + ' • ± ' + fase.umurHari + ' hari</small>' +
            '</div>');

        if (typeof window.hitungRisikoTikus === 'function')
            weatherData.insertAdjacentHTML('beforeend', boksRisiko('🐀 Peringatan Dini Tikus Sawah', window.hitungRisikoTikus(cur.rain || 0, fase)));
        if (typeof window.hitungRisikoHamaPBP === 'function')
            weatherData.insertAdjacentHTML('beforeend', boksRisiko('🐛 Peringatan Dini Penggerek Batang', window.hitungRisikoHamaPBP(cur.temperature_2m, cur.relative_humidity_2m, fase)));
        if (typeof window.hitungRisikoSheathBlight === 'function')
            weatherData.insertAdjacentHTML('beforeend', boksRisiko('🍂 Hawar Pelepah (Sheath Blight)', window.hitungRisikoSheathBlight(cur.temperature_2m, cur.relative_humidity_2m, fase)));
        if (typeof window.hitungRisikoWereng === 'function')
            weatherData.insertAdjacentHTML('beforeend', boksRisiko('🪳 Wereng Batang Coklat', window.hitungRisikoWereng(cur.temperature_2m, cur.relative_humidity_2m, cur.rain || 0, fase)));
        if (typeof window.hitungRisikoTungro === 'function')
            weatherData.insertAdjacentHTML('beforeend', boksRisiko('🌾 Tungro (Virus)', window.hitungRisikoTungro(cur.temperature_2m, cur.relative_humidity_2m, cur.rain || 0, fase)));

        var lokal = document.getElementById('localSstBox');
        if (lokal) lokal.style.display = 'block';
        if (typeof window.loadGlobalClimateIndices === 'function') window.loadGlobalClimateIndices();
    }

    // =========================================================================
    //  RENDER UI TOMBOL GPS
    // =========================================================================

    function renderUITombolGPS(koordinat) {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) return;

        // ── FIX UTAMA: simpan nilai input sebelum innerHTML diganti ──────────
        simpanNilaiInput();
        // ─────────────────────────────────────────────────────────────────────

        var statusAkurasi, bgTombol, ikonTombol, teksTombol;
        if (koordinat.akurasi === 'gps') {
            statusAkurasi = '<span style="color:#10b981;">✅ GPS Akurat — Analisis risiko aktif</span>';
            bgTombol   = 'linear-gradient(135deg,#10b981,#059669)';
            ikonTombol = '✅';
            teksTombol = 'GPS TERSINKRON — KLIK UNTUK PERBARUI';
        } else if (koordinat.akurasi === 'bts') {
            statusAkurasi = '<span style="color:#f59e0b;">⚠️ Dari sinyal BTS/WiFi — Tekan Tombol (SINKRONKAN GPS) di bawah untuk lokasi sawah akurat</span>';
            bgTombol   = 'linear-gradient(135deg,#3b82f6,#2563eb)';
            ikonTombol = '🛰️';
            teksTombol = 'SINKRONKAN GPS & SATELIT';
        } else {
            statusAkurasi = '<span style="color:#64748b;">📡 Data umum wilayah — Tekan GPS untuk lokasi sawah</span>';
            bgTombol   = 'linear-gradient(135deg,#3b82f6,#2563eb)';
            ikonTombol = '🛰️';
            teksTombol = 'SINKRONKAN GPS & SATELIT';
        }

        gpsPrompt.innerHTML =
            '<div id="infoLokasiCuaca" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:14px;padding:12px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
            '<div>' +
            '<div style="font-size:0.68rem;font-weight:700;color:#64748b;letter-spacing:1px;margin-bottom:3px;">📡 LOKASI AKTIF</div>' +
            '<div id="namaLokasiCuacaUI" style="font-size:0.85rem;font-weight:700;color:#3b82f6;">' + koordinat.label + '</div>' +
            '<div id="statusLokasiCuacaUI" style="font-size:0.7rem;font-weight:600;margin-top:3px;">' + statusAkurasi + '</div>' +
            '</div>' +
            '<span style="font-size:1.6rem;flex-shrink:0;">' + (koordinat.akurasi === 'gps' ? '🛰️' : '📡') + '</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
            '<div><label style="font-size:0.68rem;color:#64748b;font-weight:700;display:block;margin-bottom:4px;">📅 TGL TANAM</label>' +
            '<input type="date" id="tglTanamCuaca" class="form-input" style="margin-bottom:0;padding:10px;font-size:0.8rem;"></div>' +
            '<div><label style="font-size:0.68rem;color:#64748b;font-weight:700;display:block;margin-bottom:4px;">🌱 VARIETAS</label>' +
            '<select id="umurVarietasCuaca" class="form-select" style="margin-bottom:0;padding:10px;font-size:0.8rem;">' +
            '<option value="genjah">Genjah (&lt;95 HST)</option>' +
            '<option value="sedang" selected>Sedang (95-115)</option>' +
            '<option value="dalam">Dalam (≥116 HST)</option>' +
            '</select></div>' +
            '</div>' +
            '<button id="btnGPSSinkron" onclick="window.sinkronGPSCuaca()"' +
            ' style="width:100%;padding:14px 16px;background:' + bgTombol + ';color:#fff;border:none;border-radius:14px;font-weight:700;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:\'Plus Jakarta Sans\',sans-serif;letter-spacing:0.3px;transition:all 0.2s;margin-bottom:8px;">' +
            '<span id="ikonBtnGPSSinkron" style="font-size:1.1rem;">' + ikonTombol + '</span>' +
            '<span id="teksBtnGPSSinkron">' + teksTombol + '</span>' +
            '</button>' +
            '<div style="font-size:0.7rem;color:#38b6ff;text-align:center;line-height:1.5;padding:0 8px;margin-bottom:4px;">' +
            'Setelah GPS tersinkron, <b>semua parameter cuaca diperbarui</b> dan risiko penyakit & hama muncul berdasarkan lokasi sawah Anda.' +
            '</div>';

        // ── FIX UTAMA: restore nilai input SETELAH innerHTML diganti ────────
        restoreNilaiInput();
        // ─────────────────────────────────────────────────────────────────────
    }

    // =========================================================================
    //  FUNGSI UTAMA: MUAT CUACA
    // =========================================================================

    async function muatCuaca(koordinat, tampilkanRisiko) {
        if (state.sedangMemuat) return;
        state.sedangMemuat = true;

        var gpsPrompt   = document.getElementById('gpsPrompt');
        var weatherData = document.getElementById('weatherData');
        var result      = document.getElementById('result');
        var resConf     = document.getElementById('resConf');
        var resLabel    = document.getElementById('resLabel');
        var boxBlast    = document.getElementById('boxBlastRisk');

        if (resLabel) resLabel.style.display = 'none';
        if (resConf)  resConf.style.display  = 'none';

        if (gpsPrompt)   gpsPrompt.style.display   = 'block';
        if (weatherData) weatherData.style.display = 'block';
        if (result)      result.style.display      = 'block';
        if (boxBlast && !tampilkanRisiko) boxBlast.style.display = 'none';

        // ── simpan nilai dulu sebelum render tombol GPS ──────────────────────
        simpanNilaiInput();
        renderUITombolGPS(koordinat);
        tampilkanSkeleton();

        try {
            var hasil = await fetchDataCuaca(koordinat.lat, koordinat.lon);
            state.dataForecast = hasil.forecast;
            state.dataArchive  = hasil.archive;

            var rendered = renderDataCuaca(hasil.forecast, hasil.archive, koordinat);

            if (tampilkanRisiko) {
                // ── pastikan nilai input ter-restore sebelum renderSemuaRisikoGPS ──
                restoreNilaiInput();
                renderSemuaRisikoGPS(rendered.cur, rendered.dp);
            } else {
                renderBannerTungguGPS();
            }
        } catch (err) {
            console.error('[patch_cuaca] Gagal fetch:', err.message);
            var namaEl   = document.getElementById('namaLokasiCuacaUI');
            var statusEl = document.getElementById('statusLokasiCuacaUI');
            if (namaEl)   namaEl.textContent = '⚠️ Gagal Memuat Data Cuaca';
            if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + (err.message || 'Periksa koneksi internet') + '</span>';
        } finally {
            state.sedangMemuat = false;
        }
    }

    // =========================================================================
    //  OVERRIDE switchMode
    // =========================================================================

    var _switchModeAsli = window.switchMode;

    window.switchMode = function(mode) {
        if (mode !== 'cuaca') {
            var resLabel = document.getElementById('resLabel');
            var resConf  = document.getElementById('resConf');
            if (resLabel) resLabel.style.display = '';
            if (resConf)  resConf.style.display  = '';
        }

        _switchModeAsli(mode);

        if (mode === 'cuaca') {
            if (state.gpsAktif) {
                var boxLokal = document.getElementById('localSstBox');
                if (boxLokal) boxLokal.style.display = 'block';
            }

            setTimeout(async function() {
                if (state.gpsAktif && state.koordinat) {
                    state.sedangMemuat = false;
                    await muatCuaca(state.koordinat, true);
                    return;
                }
                if (state.btsSudahDicoba && state.koordinat) {
                    state.sedangMemuat = false;
                    await muatCuaca(state.koordinat, false);
                } else if (state.btsSudahDicoba && !state.koordinat) {
                    setTimeout(async function() {
                        if (state.koordinat) {
                            state.sedangMemuat = false;
                            await muatCuaca(state.koordinat, false);
                        }
                    }, 1500);
                } else {
                    state.btsSudahDicoba = true;
                    try {
                        var koordinat = await dapatkanLokasiVIABTS();
                        if (koordinat.akurasi === 'bts' || koordinat.akurasi === 'ip') {
                            var nama = await reverseGeocode(koordinat.lat, koordinat.lon);
                            if (nama) koordinat.label = nama;
                        }
                        state.koordinat = koordinat;
                        await muatCuaca(koordinat, false);
                    } catch(err) {
                        state.koordinat = Object.assign({}, LOK_FALLBACK);
                        await muatCuaca(state.koordinat, false);
                    }
                }
            }, 80);
        }
    };

    // =========================================================================
    //  FUNGSI SINKRON GPS
    // =========================================================================

    window.sinkronGPSCuaca = async function() {
        var btn     = document.getElementById('btnGPSSinkron');
        var ikonBtn = document.getElementById('ikonBtnGPSSinkron');
        var teksBtn = document.getElementById('teksBtnGPSSinkron');

        // ── simpan nilai input sebelum proses GPS (antisipasi render ulang) ──
        simpanNilaiInput();

        if (btn)     { btn.disabled = true; btn.style.opacity = '0.75'; }
        if (ikonBtn) ikonBtn.textContent = '⏳';
        if (teksBtn) teksBtn.textContent = 'MENCARI SINYAL GPS...';

        try {
            var pos = await new Promise(function(resolve, reject) {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    function() {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: false, timeout: 20000, maximumAge: 60000
                        });
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
            });

            window._koordinatTerakhir = pos;
            var lat = pos.coords.latitude;
            var lon = pos.coords.longitude;

            if (teksBtn) teksBtn.textContent = 'MENDAPATKAN NAMA LOKASI...';

            var label = lat.toFixed(5) + ', ' + lon.toFixed(5);
            var namaLokasi = await reverseGeocode(lat, lon);
            if (namaLokasi) label = namaLokasi;

            state.koordinat = { lat: lat, lon: lon, label: label, akurasi: 'gps' };
            state.gpsAktif  = true;
            state.btsSudahDicoba = true;

            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
            }
            if (ikonBtn) ikonBtn.textContent = '✅';
            if (teksBtn) teksBtn.textContent = 'GPS TERSINKRON — KLIK UNTUK PERBARUI';

            var namaEl   = document.getElementById('namaLokasiCuacaUI');
            var statusEl = document.getElementById('statusLokasiCuacaUI');
            if (namaEl)   namaEl.textContent = label;
            if (statusEl) statusEl.innerHTML = '<span style="color:#10b981;">✅ GPS Akurat — Analisis risiko aktif</span>';

            state.sedangMemuat = false;
            await muatCuaca(state.koordinat, true);

        } catch(err) {
            console.error('[patch_cuaca] GPS gagal:', err);
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.background = 'linear-gradient(135deg,#ef4444,#dc2626)'; }
            if (ikonBtn) ikonBtn.textContent = '❌';
            if (teksBtn) teksBtn.textContent = 'GPS GAGAL — KLIK UNTUK COBA LAGI';
            setTimeout(function() {
                if (btn)     { btn.style.background = 'linear-gradient(135deg,#3b82f6,#2563eb)'; btn.disabled = false; }
                if (ikonBtn) ikonBtn.textContent = '🛰️';
                if (teksBtn) teksBtn.textContent  = 'SINKRONKAN GPS & SATELIT';
            }, 4000);
        }
    };

    window.aktifkanGPS = async function() { await window.sinkronGPSCuaca(); };

    // =========================================================================
    //  CSS
    // =========================================================================

    var style = document.createElement('style');
    style.textContent =
        '@keyframes fadeInUpCuaca {' +
        'from{opacity:0;transform:translateY(10px);}' +
        'to{opacity:1;transform:translateY(0);}' +
        '}' +
        '.info-box-risiko{animation:fadeInUpCuaca 0.45s ease;}' +
        '#weatherData{display:block!important;}' +
        '#gpsPrompt>button.btn-main.btn-live{display:none!important;}' +
        '#btnGPSSinkron{transition:background 0.3s ease,opacity 0.2s;}' +
        '#btnGPSSinkron:active{transform:scale(0.98);opacity:0.85;}' +
        'body.light-mode #infoLokasiCuaca{background:rgba(59,130,246,0.06)!important;border-color:rgba(59,130,246,0.2)!important;}' +
        'body.light-mode #namaLokasiCuacaUI{color:#1d4ed8!important;}' +
        'body.light-mode #bannerTungguGPS{background:rgba(59,130,246,0.04)!important;}';
    document.head.appendChild(style);

    console.log('✅ [patch_cuaca_langsung v2.4] FIX: nilai input tanggal/varietas survive render ulang.');

    // =========================================================================
    //  AUTO-INIT — Background Prefetch
    // =========================================================================

    async function prefetchCuacaBackground() {
        if (state.btsSudahDicoba) return;
        state.btsSudahDicoba = true;

        try {
            var koordinat = await dapatkanLokasiVIABTS();
            if (koordinat.akurasi === 'bts' || koordinat.akurasi === 'ip') {
                try {
                    var nama = await reverseGeocode(koordinat.lat, koordinat.lon);
                    if (nama) koordinat.label = nama;
                } catch(e) {}
            }
            state.koordinat = koordinat;
        } catch(e) {
            state.koordinat = Object.assign({}, LOK_FALLBACK);
        }

        var boxCuaca = document.getElementById('boxCuaca');
        var modeCuacaAktif = boxCuaca && boxCuaca.style.display !== 'none';

        if (modeCuacaAktif) {
            await muatCuaca(state.koordinat, false);
        }
    }

    setTimeout(prefetchCuacaBackground, 100);

})();
