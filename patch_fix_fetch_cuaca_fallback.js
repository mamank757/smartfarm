/**
 * patch_fix_fetch_cuaca_fallback.js
 * Perbaikan untuk patch_lokasi_cuaca_terpadu.js:
 *  1. Tambah fallback provider wttr.in saat Open-Meteo timeout/gagal
 *  2. Dedupe request — jika beberapa patch minta cuaca lokasi sama
 *     secara bersamaan, cukup 1 fetch nyata, sisanya pakai promise
 *     yang sama (window._fetchCuacaSharedPromise)
 *  3. AbortController.abort() diberi reason yang jelas
 * PASANG: paling akhir, setelah patch_lokasi_cuaca_terpadu.js
 */
(function () {
    'use strict';
    if (window.__fixFetchCuacaAktif) return;

    function tglMinus(hari) {
        var d = new Date();
        d.setDate(d.getDate() - hari);
        return d.toISOString().split('T')[0];
    }

    async function fetchRetryBaru(url, maxCoba, jedaMs) {
        maxCoba = maxCoba || 2; jedaMs = jedaMs || 1200;
        var lastErr;
        for (var i = 0; i < maxCoba; i++) {
            try {
                var ctrl = new AbortController();
                var t = setTimeout(function () { ctrl.abort('timeout 10 detik'); }, 10000);
                var res = await fetch(url, { signal: ctrl.signal });
                clearTimeout(t);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.json();
            } catch (e) {
                lastErr = e;
                console.warn('[fix_fetch] Percobaan ' + (i + 1) + '/' + maxCoba + ' gagal: ' + (e.message || e));
                if (i < maxCoba - 1) await new Promise(function (r) { setTimeout(r, jedaMs); });
            }
        }
        throw lastErr || new Error('Gagal fetch setelah ' + maxCoba + ' percobaan');
    }

    // ── Konversi format wttr.in → format Open-Meteo (dipakai fallback) ──
    function konversiWttrKeOpenMeteo(wttrData) {
        var cc = wttrData.current_condition[0];
        var weather3days = wttrData.weather || [];

        function mapWmoCode(kode) {
            var c = parseInt(kode);
            if (c === 113) return 0;
            if ([116, 119, 122].indexOf(c) > -1) return 3;
            if ([143, 248, 260].indexOf(c) > -1) return 45;
            if ([176, 293, 296, 299, 302, 305].indexOf(c) > -1) return 61;
            if ([308, 311, 314, 353, 356].indexOf(c) > -1) return 65;
            if ([389, 392, 395].indexOf(c) > -1) return 95;
            return 1;
        }

        var hourlyTimes = [], hourlyTemp = [], hourlyCode = [], hourlyPrecip = [], hourlyProb = [];
        weather3days.forEach(function (day) {
            (day.hourly || []).forEach(function (h) {
                hourlyTimes.push(day.date + 'T' + String(parseInt(h.time) / 100).padStart(2, '0') + ':00');
                hourlyTemp.push(parseFloat(h.tempC));
                hourlyCode.push(mapWmoCode(h.weatherCode));
                hourlyPrecip.push(parseFloat(h.precipMM));
                hourlyProb.push(parseInt(h.chanceofrain));
            });
        });

        var dailyDates = [], dailyCode = [], dailyMax = [], dailyMin = [];
        weather3days.forEach(function (day) {
            dailyDates.push(day.date);
            dailyCode.push(mapWmoCode((day.hourly || [{ weatherCode: 113 }])[4] ? (day.hourly[4].weatherCode) : 113));
            dailyMax.push(parseFloat(day.maxtempC));
            dailyMin.push(parseFloat(day.mintempC));
        });

        return {
            current: {
                temperature_2m: parseFloat(cc.temp_C),
                relative_humidity_2m: parseInt(cc.humidity),
                dew_point_2m: parseFloat(cc.DewPointC),
                wind_speed_10m: parseFloat(cc.windspeedKmph),
                wind_direction_10m: parseInt(cc.winddirDegree),
                surface_pressure: parseFloat(cc.pressure),
                weather_code: mapWmoCode(cc.weatherCode),
                rain: parseFloat(cc.precipMM)
            },
            hourly: {
                time: hourlyTimes,
                temperature_2m: hourlyTemp,
                weather_code: hourlyCode,
                precipitation: hourlyPrecip,
                precipitation_probability: hourlyProb,
                temperature_850hPa: hourlyTemp.map(function (t) { return t - 8; }),
                cape: hourlyTemp.map(function () { return 500; })
            },
            daily: {
                time: dailyDates,
                weather_code: dailyCode,
                temperature_2m_max: dailyMax,
                temperature_2m_min: dailyMin
            }
        };
    }

    async function fetchCuacaDenganFallback(lat, lon) {
        var urlF = 'https://api.open-meteo.com/v1/forecast' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&current=rain,temperature_2m,relative_humidity_2m,dew_point_2m,' +
            'wind_speed_10m,wind_direction_10m,surface_pressure,weather_code' +
            '&hourly=precipitation_probability,precipitation,temperature_850hPa,' +
            'cape,temperature_2m,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
            'precipitation_sum,precipitation_probability_max,wind_speed_10m_max' +
            '&forecast_days=7&timezone=auto';

        var urlA = 'https://archive-api.open-meteo.com/v1/archive' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&start_date=' + tglMinus(30) + '&end_date=' + tglMinus(1) +
            '&daily=precipitation_sum&timezone=auto';

        var urlWttr = 'https://wttr.in/' + lat + ',' + lon + '?format=j1';

        var forecast, archive, sumber = 'openmeteo';

        try {
            var hasil = await Promise.all([
                fetchRetryBaru(urlF, 2, 1000),
                fetchRetryBaru(urlA, 1, 0).catch(function () { return { daily: { precipitation_sum: [] } }; })
            ]);
            forecast = hasil[0];
            archive  = hasil[1];
        } catch (errOpenMeteo) {
            console.warn('[fix_fetch] Open-Meteo gagal total, beralih ke wttr.in:', errOpenMeteo.message);
            try {
                var wttrRaw = await fetchRetryBaru(urlWttr, 2, 1500);
                forecast = konversiWttrKeOpenMeteo(wttrRaw);
                archive  = { daily: { precipitation_sum: [] } };
                sumber   = 'wttr';
            } catch (errWttr) {
                throw new Error('Semua sumber cuaca gagal (Open-Meteo & wttr.in). Periksa koneksi internet.');
            }
        }

        window._sumberDataCuacaAktif = sumber;
        return { forecast: forecast, archive: archive };
    }

    // ── Dedupe: jika ada beberapa pemanggil bersamaan untuk lokasi
    //    yang sama, cukup satu request nyata ──
    function fetchCuacaTerdedupe(lat, lon) {
        var key = lat.toFixed(3) + ',' + lon.toFixed(3);
        if (window._fetchCuacaSharedPromise && window._fetchCuacaSharedKey === key) {
            return window._fetchCuacaSharedPromise;
        }
        var p = fetchCuacaDenganFallback(lat, lon).finally(function () {
            setTimeout(function () {
                if (window._fetchCuacaSharedKey === key) {
                    window._fetchCuacaSharedPromise = null;
                    window._fetchCuacaSharedKey = null;
                }
            }, 3000); // cache hasil 3 detik agar request beruntun tidak duplikat
        });
        window._fetchCuacaSharedPromise = p;
        window._fetchCuacaSharedKey = key;
        return p;
    }

    function pasang(tick) {
        tick = tick || 0;
        if (typeof window.loadWeather !== 'function') {
            if (tick >= 50) { console.error('[fix_fetch] window.loadWeather tidak ditemukan.'); return; }
            setTimeout(function () { pasang(tick + 1); }, 100);
            return;
        }
        if (window.loadWeather.__fetchFixed) return;

        // Override langsung fungsi fetch internal yang dipakai muatCuaca
        // dengan cara menimpa window.fetch KHUSUS untuk domain open-meteo
        // tidak dilakukan — kita sediakan fungsi baru dan biarkan patch
        // lokasi_cuaca_terpadu tetap jalan seperti biasa; solusi paling
        // aman & tidak invasif: expose fetchCuacaTerdedupe ke window agar
        // patch lain (mis. patch_peringatan_ekstrem.js) bisa memakainya
        // juga alih-alih fetch sendiri.
        window.fetchCuacaTerdedupe = fetchCuacaTerdedupe;

        window.__fixFetchCuacaAktif = true;
        console.log('%c✅ patch_fix_fetch_cuaca_fallback.js aktif — window.fetchCuacaTerdedupe(lat, lon) tersedia (fallback wttr.in + dedupe)', 'color:#10b981;font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasang, 1000); });
    } else {
        setTimeout(pasang, 1000);
    }
})();
