/**
 * ============================================================
 *  PATCH: Menu Risiko Cuaca — Tampil Langsung via BTS,
 *         Sinkron GPS untuk Data Akurat + Risiko Lengkap
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 2.2 (sinkronisasi penuh dengan index.html)
 * ============================================================
 *
 *  CARA PASANG (urutan wajib):
 *    <script src="patch_smartfarming.js"></script>
 *    <script src="patch_riwayat_tambahan.js"></script>
 *    <script src="patch_cuaca_langsung.js"></script>  ← paling akhir
 *
 *  CARA KERJA:
 *  TAHAP 1 — OTOMATIS saat klik menu "RISIKO CUACA":
 *    • Ambil lokasi via BTS/IP (tanpa minta izin GPS)
 *    • Tampilkan langsung:
 *        - 📍 Lokasi Koordinat
 *        - 🔮 Prediksi Atmosfer (1 Jam Kedepan)
 *        - 🕒 Prakiraan Cuaca Per Jam
 *        - 📅 Prakiraan 7 Hari Kedepan
 *        - 📊 Real-Time Parameter Lahan (Satelit)
 *        - 🛰️ Analisis Satelit Mikro Spasial Lahan
 *
 *  TAHAP 2 — Setelah tekan "SINKRONKAN GPS & SATELIT":
 *    • Ambil koordinat GPS presisi tinggi
 *    • Refresh SEMUA parameter cuaca dengan data akurat
 *    • Tampilkan tambahan:
 *        - ⚠️ Risiko Blast Padi
 *        - 🍂 Hawar Pelepah (Sheath Blight)
 *        - 🪳 Wereng Batang Coklat
 *        - 🐛 Penggerek Batang Padi
 *        - 🌾 Tungro (Virus)
 *        - 🐀 Peringatan Hama Tikus
 *        - 🌱 Fase Tanaman Saat Ini
 *        - 📈 Proyeksi Iklim ENSO / IOD / SST
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
    };

    // =========================================================================
    //  UTILITAS
    // =========================================================================

    async function fetchRetry(url, maxCoba = 3, jedaMs = 1500) {
        for (let i = 0; i < maxCoba; i++) {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 12000);
                const res = await fetch(url, { signal: ctrl.signal });
                clearTimeout(t);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.json();
            } catch (e) {
                if (i < maxCoba - 1) await new Promise(r => setTimeout(r, jedaMs));
                else throw e;
            }
        }
    }

    function tglMinus(hari) {
        const d = new Date();
        d.setDate(d.getDate() - hari);
        return d.toISOString().split('T')[0];
    }

    async function reverseGeocode(lat, lon) {
        try {
            const res = await fetch(
                'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon,
                { headers: { 'User-Agent': 'SmartFarming-PPLWajo/2.0' } }
            );
            if (!res.ok) return null;
            const d = await res.json();
            const a = d.address || {};
            const desa = a.village || a.suburb || a.hamlet || a.town || 'Lokasi';
            const kab  = a.county  || a.city   || a.municipality || '';
            return desa + ', Kab. ' + kab;
        } catch (e) {
            return null;
        }
    }

    // =========================================================================
    //  TAHAP 1: DAPATKAN LOKASI VIA BTS / IP GEOLOCATION
    // =========================================================================

    async function dapatkanLokasiVIABTS() {
        // Jika sudah ada cache GPS sebelumnya, pakai itu
        if (window._koordinatTerakhir) {
            const pos = window._koordinatTerakhir;
            return {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                label: 'Lokasi Tersimpan (GPS Sebelumnya)',
                akurasi: 'gps'
            };
        }

        // Coba navigator.geolocation dengan enableHighAccuracy: false
        // (menggunakan sinyal BTS/WiFi, TIDAK butuh GPS chip)
        try {
            const pos = await new Promise((resolve, reject) => {
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

        // IP Geolocation sebagai fallback
        const ipSources = [
            async function() {
                const d = await fetchRetry('https://ipapi.co/json/', 1, 0);
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
                const d = await fetchRetry('https://ip-api.com/json/?fields=lat,lon,city,regionName', 1, 0);
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
                const hasil = await ipSources[i]();
                if (hasil) return hasil;
            } catch (e) {}
        }

        return Object.assign({}, LOK_FALLBACK);
    }

    // =========================================================================
    //  TAHAP 2: FETCH DATA CUACA OPEN-METEO
    // =========================================================================

    async function fetchDataCuaca(lat, lon) {
        const urlForecast =
            'https://api.open-meteo.com/v1/forecast' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&current=rain,temperature_2m,relative_humidity_2m,dew_point_2m,' +
            'wind_speed_10m,wind_direction_10m,surface_pressure,weather_code' +
            '&hourly=precipitation_probability,precipitation,temperature_850hPa,' +
            'cape,temperature_2m,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
            '&forecast_days=7&timezone=auto';

        const urlArchive =
            'https://archive-api.open-meteo.com/v1/archive' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&start_date=' + tglMinus(30) + '&end_date=' + tglMinus(1) +
            '&daily=precipitation_sum&timezone=auto';

        const [forecast, archive] = await Promise.all([
            fetchRetry(urlForecast),
            fetchRetry(urlArchive).catch(function() { return { daily: { precipitation_sum: [] } }; })
        ]);

        return { forecast: forecast, archive: archive };
    }

    // =========================================================================
    //  RENDER DATA CUACA
    // =========================================================================

    function cuacaDariKode(code) {
        if (code === 0)                              return { ikon: '☀️', teks: 'Cerah' };
        if ([1,2,3].includes(code))                 return { ikon: '☁️', teks: 'Berawan' };
        if ([45,48].includes(code))                 return { ikon: '🌫️', teks: 'Berkabut' };
        if ([51,53,55,61,63,80,81].includes(code))  return { ikon: '🌧️', teks: 'Hujan Ringan' };
        if ([65,82].includes(code))                 return { ikon: '🌧️', teks: 'Hujan Lebat' };
        if ([95,96,99].includes(code))              return { ikon: '⛈️', teks: 'Badai Petir' };
        return { ikon: '⛅', teks: 'Berawan' };
    }

    function tampilkanSkeleton() {
        const hourlyBox = document.getElementById('hourlyForecastContainer');
        if (hourlyBox) {
            hourlyBox.innerHTML = Array(8).fill(0).map(function() {
                return '<div class="hourly-card" style="min-width:75px;opacity:0.5;">' +
                    '<div style="background:#1e2f45;border-radius:6px;height:11px;width:36px;margin:0 auto 8px;"></div>' +
                    '<div style="background:#1e2f45;border-radius:50%;height:28px;width:28px;margin:0 auto 8px;"></div>' +
                    '<div style="background:#1e2f45;border-radius:6px;height:13px;width:34px;margin:0 auto;"></div>' +
                    '</div>';
            }).join('');
        }
        const dailyBox = document.getElementById('dailyForecastContainer');
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
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span style="background:#1e2f45;border-radius:4px;display:inline-block;width:65px;height:13px;"></span>';
        });
    }

    function renderDataCuaca(forecast, archive, koordinat) {
        const cur    = forecast.current;
        const hourly = forecast.hourly;
        const daily  = forecast.daily;

        const now = new Date();
        const waktuStr =
            now.getFullYear() + '-' +
            String(now.getMonth()+1).padStart(2,'0') + '-' +
            String(now.getDate()).padStart(2,'0') + 'T' +
            String(now.getHours()).padStart(2,'0') + ':00';
        let idx = hourly.time.findIndex(function(t) { return t.startsWith(waktuStr); });
        if (idx === -1) idx = hourly.time.findIndex(function(t) { return new Date(t) >= now; });
        if (idx === -1) idx = 0;

        // ── Lokasi ───────────────────────────────────────────────────────────
        const lokasiEl = document.getElementById('lokasiSawah');
        const alamatEl = document.getElementById('alamatDesa');
        if (lokasiEl) lokasiEl.innerText = koordinat.lat.toFixed(5) + ', ' + koordinat.lon.toFixed(5);
        if (alamatEl) {
            const warnaBadge = koordinat.akurasi === 'gps' ? '#10b981' : (koordinat.akurasi === 'bts' ? '#f59e0b' : '#64748b');
            const ikonBadge  = koordinat.akurasi === 'gps' ? '🛰️' : '📡';
            const labelBadge = koordinat.akurasi === 'gps' ? 'GPS Akurat' : (koordinat.akurasi === 'bts' ? 'Lokasi dari sinyal BTS/WiFi' : 'Estimasi Wilayah');
            alamatEl.innerHTML =
                '<b>' + koordinat.label + '</b>' +
                '<span style="display:inline-block;margin-left:8px;font-size:0.7rem;padding:2px 8px;border-radius:6px;' +
                'background:rgba(255,255,255,0.08);color:' + warnaBadge + ';">' +
                ikonBadge + ' ' + labelBadge + '</span>';
        }

        // ── Prakiraan Per Jam ────────────────────────────────────────────────
        const hourlyBox = document.getElementById('hourlyForecastContainer');
        if (hourlyBox) {
            hourlyBox.innerHTML = '';
            for (var i = idx; i < idx + 12 && i < hourly.time.length; i++) {
                const jam   = hourly.time[i].split('T')[1].substring(0,5);
                const cuaca = cuacaDariKode(hourly.weather_code[i]);
                const suhu  = hourly.temperature_2m[i].toFixed(0);
                hourlyBox.innerHTML +=
                    '<div class="hourly-card">' +
                    '<div class="time">' + jam + '</div>' +
                    '<div class="icon" title="' + cuaca.teks + '">' + cuaca.ikon + '</div>' +
                    '<div class="temp">' + suhu + '°C</div>' +
                    '</div>';
            }
        }

        // ── Prakiraan 7 Hari ─────────────────────────────────────────────────
        const dailyBox = document.getElementById('dailyForecastContainer');
        if (dailyBox) {
            dailyBox.innerHTML = '';
            const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
            daily.time.forEach(function(tgl, j) {
                const d    = new Date(tgl);
                const hari = j === 0 ? 'Hari Ini' : HARI[d.getDay()];
                const c    = cuacaDariKode(daily.weather_code[j]);
                const maks = daily.temperature_2m_max[j].toFixed(0);
                const min  = daily.temperature_2m_min[j].toFixed(0);
                dailyBox.innerHTML +=
                    '<div class="daily-item">' +
                    '<div class="day">' + hari + '</div>' +
                    '<div class="icon" title="' + c.teks + '">' + c.ikon + '</div>' +
                    '<div class="temp-range">' + min + '°/' + maks + '°C</div>' +
                    '</div>';
            });
        }

        // ── Parameter Real-Time ──────────────────────────────────────────────
        const dp   = (cur.temperature_2m - cur.dew_point_2m).toFixed(1);
        const cape = hourly.cape ? (hourly.cape[idx] || 0) : 0;
        const t850 = hourly.temperature_850hPa ? hourly.temperature_850hPa[idx] : '-';

        function set(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
        set('dpSpread',    dp + ' °C');
        set('suhuNow',     cur.temperature_2m + ' °C');
        set('humidityNow', cur.relative_humidity_2m + '%');
        set('windNow',     cur.wind_speed_10m + ' km/jam');
        set('pressNow',    cur.surface_pressure + ' hPa');
        set('tempUpper',   t850 + ' °C');

        const capeEl = document.getElementById('capeVal');
        if (capeEl) {
            const st = cape > 2500 ? '‼️ EKSTREM' : (cape > 1000 ? '⚠️ WASPADA' : '✅ STABIL');
            capeEl.innerHTML = cape + ' J/kg<br><small>Status: ' + st + '</small>';
        }

        const listHujan    = (archive.daily || {}).precipitation_sum || [];
        const totalBulanan = listHujan.reduce(function(t,v){ return t+(v||0); }, 0);
        set('rainNow',     (cur.rain || 0).toFixed(1) + ' mm/jam');
        set('rainMonthly', '<b>' + totalBulanan.toFixed(1) + ' mm</b>');

        const ARAH  = ['Utara','Timur Laut','Timur','Tenggara','Selatan','Barat Daya','Barat','Barat Laut'];
        const dirEl = document.getElementById('windDir');
        if (dirEl) {
            const arahIdx = Math.round(cur.wind_direction_10m / 45) % 8;
            dirEl.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;">' +
                '<span style="transform:rotate(' + (cur.wind_direction_10m + 180) + 'deg)">⬆️</span>' +
                '<span>Dari ' + ARAH[arahIdx] + '</span></div>';
        }

        // ── Prediksi Atmosfer ────────────────────────────────────────────────
        var rainScore = 0;
        const prob = hourly.precipitation_probability;
        if (prob && (prob[idx + 1] ?? 0) >= 30) rainScore += 40;
        if (cape >= 1000)                        rainScore += 30;
        if (parseFloat(dp) <= 2)                 rainScore += 20;
        if (cur.relative_humidity_2m >= 90)      rainScore += 10;

        const boxHujan = document.getElementById('prediksiHujan');
        const txtHujan = document.getElementById('hujanNext');
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
        const radarEl = document.getElementById('radarMap');
        if (radarEl) radarEl.src = 'https://mamank757.github.io/peta?lat=' + koordinat.lat + '&lon=' + koordinat.lon;

        // resLabel dan resConf (frame lama HTML) disembunyikan oleh muatCuaca.
        // Status lokasi & akurasi kini tampil di #infoLokasiCuaca dalam gpsPrompt.

        return { cur: cur, dp: dp, cape: cape, idx: idx };
    }

    // =========================================================================
    //  RENDER BOX RISIKO (hanya setelah GPS aktif)
    // =========================================================================

    function hapusBoxRisiko() {
        document.querySelectorAll('#weatherData .info-box-risiko').forEach(function(el){ el.remove(); });
        document.querySelectorAll('#weatherData .info-box-dynamic').forEach(function(el){ el.remove(); });
        const boxBlast = document.getElementById('boxBlastRisk');
        if (boxBlast) boxBlast.style.display = 'none';
        const lokal = document.getElementById('localSstBox');
        if (lokal) lokal.style.display = 'none';
    }

    function renderBannerTungguGPS() {
        hapusBoxRisiko();
        const weatherData = document.getElementById('weatherData');
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
        const banner = document.getElementById('bannerTungguGPS');
        if (banner) banner.remove();

        const boxBlast = document.getElementById('boxBlastRisk');
        if (boxBlast) {
            boxBlast.style.display = 'block';
            if (typeof window.analyzeDiseaseRisk === 'function') {
                window.analyzeDiseaseRisk(cur, dp);
            }
        }

        const weatherData = document.getElementById('weatherData');
        if (!weatherData) return;

        const fase = typeof window.analisisFaseTanaman === 'function'
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

        const lokal = document.getElementById('localSstBox');
        if (lokal) lokal.style.display = 'block';
        if (typeof window.loadGlobalClimateIndices === 'function') window.loadGlobalClimateIndices();
    }

    // =========================================================================
    //  RENDER UI TOMBOL GPS
    // =========================================================================

    function renderUITombolGPS(koordinat) {
        const gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) return;

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

        gpsPrompt.style.display = 'block';
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
            '<div style="font-size:0.7rem;color:#475569;text-align:center;line-height:1.5;padding:0 8px;margin-bottom:4px;">' +
            'Setelah GPS tersinkron, <b>semua parameter cuaca diperbarui</b> dan risiko penyakit & hama muncul berdasarkan lokasi sawah Anda.' +
            '</div>';

        try {
            const la = JSON.parse(localStorage.getItem('sf_lahan_aktif') || 'null');
            if (la) {
                const tglEl = document.getElementById('tglTanamCuaca');
                const varEl = document.getElementById('umurVarietasCuaca');
                if (tglEl && la.tglTanam)     tglEl.value = la.tglTanam;
                if (varEl && la.varietasUmur) varEl.value = la.varietasUmur;
            }
        } catch(e) {}
    }

    // =========================================================================
    //  FUNGSI UTAMA: MUAT CUACA
    // =========================================================================

    async function muatCuaca(koordinat, tampilkanRisiko) {
        if (state.sedangMemuat) return;
        state.sedangMemuat = true;

        const gpsPrompt   = document.getElementById('gpsPrompt');
        const weatherData = document.getElementById('weatherData');
        const result      = document.getElementById('result');
        const resConf     = document.getElementById('resConf');
        const resLabel    = document.getElementById('resLabel');
        const boxBlast    = document.getElementById('boxBlastRisk');

        // Sembunyikan frame status lama milik HTML (resLabel + resConf di #result)
        // karena patch punya UI lokasi sendiri di dalam gpsPrompt (#infoLokasiCuaca).
        // Akan dikembalikan visible oleh switchMode saat user pindah ke mode lain.
        if (resLabel) resLabel.style.display = 'none';
        if (resConf)  resConf.style.display  = 'none';

        if (gpsPrompt)   gpsPrompt.style.display   = 'block';
        if (weatherData) weatherData.style.display = 'block';
        if (result)      result.style.display      = 'block';
        if (boxBlast && !tampilkanRisiko) boxBlast.style.display = 'none';

        renderUITombolGPS(koordinat);
        tampilkanSkeleton();

        try {
            const hasil = await fetchDataCuaca(koordinat.lat, koordinat.lon);
            state.dataForecast = hasil.forecast;
            state.dataArchive  = hasil.archive;

            const rendered = renderDataCuaca(hasil.forecast, hasil.archive, koordinat);

            if (tampilkanRisiko) {
                renderSemuaRisikoGPS(rendered.cur, rendered.dp);
            } else {
                renderBannerTungguGPS();
            }
        } catch (err) {
            console.error('[patch_cuaca] Gagal fetch:', err.message);
            // Tampilkan error di dalam gpsPrompt (UI patch), bukan resLabel lama
            const namaEl = document.getElementById('namaLokasiCuacaUI');
            const statusEl = document.getElementById('statusLokasiCuacaUI');
            if (namaEl)   namaEl.textContent = '⚠️ Gagal Memuat Data Cuaca';
            if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + (err.message || 'Periksa koneksi internet') + '</span>';
        } finally {
            state.sedangMemuat = false;
        }
    }

    // =========================================================================
    //  OVERRIDE switchMode
    // =========================================================================

    const _switchModeAsli = window.switchMode;

    window.switchMode = function(mode) {
        // Kembalikan resLabel & resConf ke visible sebelum switchMode asli jalan,
        // agar mode lain (kamera, BWD, ukur, dll) bisa menggunakannya normal
        if (mode !== 'cuaca') {
            const resLabel = document.getElementById('resLabel');
            const resConf  = document.getElementById('resConf');
            if (resLabel) resLabel.style.display = '';
            if (resConf)  resConf.style.display  = '';
        }

        _switchModeAsli(mode);

        if (mode === 'cuaca') {
            // Pulihkan localSstBox jika GPS sudah aktif (HTML switchMode selalu hide-nya)
            if (state.gpsAktif) {
                const boxLokal = document.getElementById('localSstBox');
                if (boxLokal) boxLokal.style.display = 'block';
            }

            setTimeout(async function() {
                if (state.gpsAktif && state.koordinat) {
                    // GPS sudah aktif → render ulang dengan risiko lengkap
                    state.sedangMemuat = false;
                    await muatCuaca(state.koordinat, true);
                    return;
                }
                if (state.btsSudahDicoba && state.koordinat) {
                    // Prefetch sudah selesai di background → render langsung, tidak fetch ulang
                    state.sedangMemuat = false;
                    await muatCuaca(state.koordinat, false);
                } else if (state.btsSudahDicoba && !state.koordinat) {
                    // Prefetch sedang berjalan → tunggu sebentar lalu coba lagi
                    setTimeout(async function() {
                        if (state.koordinat) {
                            state.sedangMemuat = false;
                            await muatCuaca(state.koordinat, false);
                        }
                    }, 1500);
                } else {
                    // Belum dicoba sama sekali (fallback)
                    state.btsSudahDicoba = true;
                    try {
                        const koordinat = await dapatkanLokasiVIABTS();
                        if (koordinat.akurasi === 'bts' || koordinat.akurasi === 'ip') {
                            const nama = await reverseGeocode(koordinat.lat, koordinat.lon);
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
        const btn     = document.getElementById('btnGPSSinkron');
        const ikonBtn = document.getElementById('ikonBtnGPSSinkron');
        const teksBtn = document.getElementById('teksBtnGPSSinkron');

        if (btn)     { btn.disabled = true; btn.style.opacity = '0.75'; }
        if (ikonBtn) ikonBtn.textContent = '⏳';
        if (teksBtn) teksBtn.textContent = 'MENCARI SINYAL GPS...';

        try {
            const pos = await new Promise(function(resolve, reject) {
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
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;

            if (teksBtn) teksBtn.textContent = 'MENDAPATKAN NAMA LOKASI...';

            var label = lat.toFixed(5) + ', ' + lon.toFixed(5);
            const namaLokasi = await reverseGeocode(lat, lon);
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

            const namaEl   = document.getElementById('namaLokasiCuacaUI');
            const statusEl = document.getElementById('statusLokasiCuacaUI');
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

    const style = document.createElement('style');
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

    console.log('✅ [patch_cuaca_langsung v2.3] Aktif: BTS otomatis → GPS akurat + risiko lengkap.');

    // =========================================================================
    //  AUTO-INIT — Background Prefetch (strategi baru, v2.3)
    //
    //  Masalah v2.2: isModeAktif() tidak reliable karena:
    //    - currentMode dideklarasi 'let' (scope lokal script tag, bukan window)
    //    - patch di-load setelah switchMode('cuaca') dipanggil, tapi SEBELUM
    //      window 'load' — state DOM bisa berubah oleh patch lain di antaranya
    //
    //  Strategi baru: ABAIKAN cek mode sama sekali.
    //  Langsung fetch lokasi + data cuaca di background begitu patch di-load.
    //  Hasilnya disimpan di `state`. Saat user berada/membuka tab cuaca,
    //  data sudah siap → render instan. Tidak ada penundaan apapun.
    //
    //  Dua skenario yang ditangani:
    //    A) Tab cuaca sudah aktif saat patch di-load → render langsung ke DOM
    //    B) Tab cuaca belum aktif → data tersimpan di state, render saat diklik
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

        // Cek apakah box cuaca sedang tampil (mode cuaca aktif saat ini)
        var boxCuaca = document.getElementById('boxCuaca');
        var modeCuacaAktif = boxCuaca && boxCuaca.style.display !== 'none';

        if (modeCuacaAktif) {
            // Render langsung ke UI karena tab cuaca sedang terbuka
            await muatCuaca(state.koordinat, false);
        }
        // Jika tidak aktif: state.koordinat sudah tersimpan.
        // switchMode override akan pakai data ini saat tab diklik.
    }

    // Jalankan segera — tidak perlu tunggu event apapun.
    // Script ini sudah ada di akhir </body>, DOM pasti sudah siap.
    setTimeout(prefetchCuacaBackground, 100);

})();
