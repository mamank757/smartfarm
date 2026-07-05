/**
 * ============================================================
 *  PATCH: Konsistensi Ikon Cuaca vs Prediksi Atmosfer
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 2.0
 * ============================================================
 *  Mempertahankan logika dari patch_konsistensi_cuaca_v1.js:
 *  - klasifikasiCuacaGabungan() — ikon & label berdasarkan
 *    kode WMO + intensitas presipitasi aktual di titik sawah
 *  - perbaruiIkonPerJam() — ikon prakiraan per jam dibedakan
 *    antara "awan hujan di area" vs "hujan aktif di sawah"
 *  - tambahRingkasanSituasi() — kotak ringkasan cuaca hari ini
 *  - tambahKeteranganPrakiraan() — catatan resolusi kecamatan
 *  CARA PASANG (setelah patch_lokasi_cuaca_terpadu.js):
 *    <script src="patch_konsistensi_cuaca_v2.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KLASIFIKASI CUACA GABUNGAN (kode WMO + presipitasi aktual)
    //  Membedakan "awan hujan di area sekitar" vs "hujan di titik sawah"
    // =========================================================================

    function klasifikasiCuacaGabungan(wCode, precip) {
        var adaHujanAktual = precip >= 0.5;
        var KODE_HUJAN = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
        var KODE_BADAI = [95, 96, 99];
        var areaAdaAwan = KODE_HUJAN.indexOf(wCode) > -1;

        if (KODE_BADAI.indexOf(wCode) > -1) {
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

        if (adaHujanAktual && precip >= 10) {
            return {
                ikon: '🌧️', label: 'Hujan Lebat', warna: '#f97316',
                keterangan: 'Hujan deras ' + precip.toFixed(1) + ' mm/jam terdeteksi di koordinat sawah Anda.',
                badge: 'HUJAN LEBAT'
            };
        }
        if (adaHujanAktual && precip >= 2.5) {
            return {
                ikon: '🌧️', label: 'Hujan Sedang', warna: '#f59e0b',
                keterangan: 'Curah hujan ' + precip.toFixed(1) + ' mm/jam di lokasi Anda.',
                badge: 'HUJAN'
            };
        }
        if (adaHujanAktual) {
            return {
                ikon: '🌦️', label: 'Gerimis / Hujan Ringan', warna: '#84cc16',
                keterangan: 'Gerimis ' + precip.toFixed(1) + ' mm/jam',
                badge: 'GERIMIS'
            };
        }

        // Ada kode awan hujan di area tapi curah hujan = 0 di titik sawah
        if (areaAdaAwan) {
            var kodeTeks = '';
            if ([51, 53, 55].indexOf(wCode) > -1) kodeTeks = 'gerimis';
            else if ([61, 63, 65].indexOf(wCode) > -1) kodeTeks = 'hujan';
            else if ([80, 81, 82].indexOf(wCode) > -1) kodeTeks = 'shower';

            return {
                ikon: '⛅',
                label: 'Awan Hujan di Sekitar Wilayah',
                warna: '#3b82f6',
                keterangan: 'Model cuaca mendeteksi sistem ' + kodeTeks + ' dalam skala kecamatan (~10 km). ' +
                    'Di titik koordinat sawah Anda saat ini belum turun hujan (0.0 mm/jam). ' +
                    'Kondisi bisa berubah dalam 30–60 menit.',
                badge: 'AWAN HUJAN SEKITAR'
            };
        }

        if ([45, 48].indexOf(wCode) > -1) {
            return {
                ikon: '🌫️', label: 'Berkabut', warna: '#94a3b8',
                keterangan: 'Kabut terpantau. Kelembapan tinggi, waspada penyakit daun.',
                badge: 'KABUT'
            };
        }
        if ([2, 3].indexOf(wCode) > -1) {
            return {
                ikon: '☁️', label: 'Berawan', warna: '#64748b',
                keterangan: 'Tutupan awan dominan. Tidak ada hujan aktif di lokasi Anda.',
                badge: 'BERAWAN'
            };
        }
        if (wCode === 1) {
            return {
                ikon: '⛅', label: 'Cerah Berawan', warna: '#22c55e',
                keterangan: 'Langit cerah dengan sebagian awan. Kondisi baik untuk kerja lahan.',
                badge: 'CERAH BERAWAN'
            };
        }
        return {
            ikon: '☀️', label: 'Cerah', warna: '#eab308',
            keterangan: 'Langit cerah. Kondisi optimal untuk kerja di sawah.',
            badge: 'CERAH'
        };
    }

    // Ekspor global agar bisa dipakai patch lain
    window.klasifikasiCuacaGabungan = klasifikasiCuacaGabungan;

    // =========================================================================
    //  PERBARUI KOTAK PREDIKSI ATMOSFER
    //  Menggantikan teks skor sederhana dengan konteks yang lebih informatif
    // =========================================================================

    function perbaruiTampilanPrediksiAtmosfer(forecast, activeIdx) {
        if (!forecast || !forecast.current || !forecast.hourly) return;

        var cur    = forecast.current;
        var hourly = forecast.hourly;

        // index jam depan
        var idxNext = activeIdx + 1;
        if (hourly.time && idxNext < hourly.time.length) {
            var now = new Date(hourly.time[activeIdx]).getTime();
            for (var i = activeIdx + 1; i < hourly.time.length; i++) {
                if (new Date(hourly.time[i]).getTime() >= now + 3600000) { idxNext = i; break; }
            }
        }
        idxNext = Math.min(idxNext, (hourly.time ? hourly.time.length - 1 : activeIdx + 1));

        var precipNext = (hourly.precipitation && hourly.precipitation[idxNext]) || 0;
        var wCodeNext  = (hourly.weather_code  && hourly.weather_code[idxNext])  || cur.weather_code || 0;
        var probNext   = (hourly.precipitation_probability && hourly.precipitation_probability[idxNext]) || 0;

        var info = klasifikasiCuacaGabungan(wCodeNext, precipNext);

        var elBox = document.getElementById('prediksiHujan');
        var elTxt = document.getElementById('hujanNext');
        if (!elBox || !elTxt) return;

        elBox.style.borderLeftColor = info.warna;
        elTxt.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<span style="font-size:1.3rem;">' + info.ikon + '</span>' +
                '<b style="color:' + info.warna + ';font-size:.95rem;">' + info.label + '</b>' +
                '<span style="font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:5px;' +
                    'background:' + info.warna + '22;color:' + info.warna + ';border:1px solid ' + info.warna + '44;">' +
                    info.badge + '</span>' +
            '</div>' +
            '<div style="font-size:.8rem;color:#94a3b8;line-height:1.6;">' + info.keterangan + '</div>' +
            '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.08);' +
                'font-size:.72rem;color:#64748b;display:flex;flex-wrap:wrap;gap:10px;">' +
                '<span>📍 Lokasi Anda: <b style="color:#cbd5e1;">' + precipNext.toFixed(1) + ' mm/jam</b></span>' +
                '<span>💧 Prob. Hujan: <b style="color:#cbd5e1;">' + probNext + '%</b></span>' +
                '<span>🌡️ Kondisi: <b style="color:#cbd5e1;">' + info.label + '</b></span>' +
            '</div>' +
            '<div style="margin-top:6px;font-size:.7rem;color:#475569;font-style:italic;">' +
                'ℹ️ Ikon awan di prakiraan = kondisi area sekitar. Angka mm/jam = curah hujan di titik sawah Anda.' +
            '</div>';
    }

    // =========================================================================
    //  CATATAN RESOLUSI PRAKIRAAN
    //  Disisipkan sekali di atas hourlyForecastContainer
    // =========================================================================

    function tambahKeteranganPrakiraan() {
        var elHourly = document.getElementById('hourlyForecastContainer');
        if (!elHourly) return;
        if (document.getElementById('keteranganPrakiraanJam')) return;

        var el = document.createElement('div');
        el.id = 'keteranganPrakiraanJam';
        el.style.cssText =
            'font-size:.7rem;color:#475569;font-style:italic;' +
            'margin-bottom:8px;padding:8px 10px;' +
            'background:rgba(59,130,246,.05);border-radius:8px;' +
            'border:1px solid rgba(59,130,246,.1);line-height:1.5;';
        el.innerHTML =
            'ℹ️ <b style="color:#3b82f6;">Catatan:</b> Ikon awan menunjukkan kondisi cuaca di area ' +
            'sekitar (skala kecamatan). Intensitas hujan aktual di sawah Anda bisa lebih kecil atau ' +
            'tidak ada sama sekali — lihat angka mm/jam di Prediksi Atmosfer di atas.';

        elHourly.parentNode.insertBefore(el, elHourly);
    }

    // =========================================================================
    //  PERBARUI IKON PER JAM
    //  Membedakan ⛅ "awan hujan sekitar" vs 🌧️ "hujan aktif"
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
            if (!hourly.time || idx >= hourly.time.length) return;

            var wCode  = (hourly.weather_code  && hourly.weather_code[idx])  || 0;
            var precip = (hourly.precipitation && hourly.precipitation[idx]) || 0;

            var areaHujan  = KODE_HUJAN.indexOf(wCode) > -1;
            var areaBadai  = KODE_BADAI.indexOf(wCode) > -1;
            var hujanAktual = precip >= 0.5;

            var elIkon = kartuEl.querySelector('.icon');
            if (!elIkon) return;

            var ikonBaru, tooltipBaru;
            if (areaBadai) {
                ikonBaru = '⛈️'; tooltipBaru = 'Potensi badai di area';
            } else if (areaHujan && hujanAktual && precip >= 10) {
                ikonBaru = '🌧️'; tooltipBaru = 'Hujan lebat ' + precip.toFixed(1) + ' mm/jam';
            } else if (areaHujan && hujanAktual && precip >= 2.5) {
                ikonBaru = '🌧️'; tooltipBaru = 'Hujan sedang ' + precip.toFixed(1) + ' mm/jam';
            } else if (areaHujan && hujanAktual) {
                ikonBaru = '🌦️'; tooltipBaru = 'Gerimis ' + precip.toFixed(1) + ' mm/jam';
            } else if (areaHujan && !hujanAktual) {
                ikonBaru = '⛅'; tooltipBaru = 'Awan hujan di sekitar area, titik sawah belum terkena (0.0 mm/jam)';
            } else {
                return; // biarkan ikon default dari render utama
            }

            elIkon.textContent = ikonBaru;
            elIkon.title = tooltipBaru;

            // label "SEKITAR" untuk membedakan secara visual
            if (areaHujan && !hujanAktual) {
                if (!kartuEl.querySelector('.label-sekitar')) {
                    var labelEl = document.createElement('div');
                    labelEl.className = 'label-sekitar';
                    labelEl.style.cssText =
                        'font-size:7px;color:#3b82f6;font-weight:700;' +
                        'margin-top:-4px;letter-spacing:.3px;text-align:center;';
                    labelEl.textContent = 'SEKITAR';
                    elIkon.insertAdjacentElement('afterend', labelEl);
                }
            }
        });
    }

    // =========================================================================
    //  RINGKASAN SITUASI CUACA HARI INI
    //  Disisipkan di atas prakiraan per jam
    // =========================================================================

    function tambahRingkasanSituasi(forecast, activeIdx) {
        if (!forecast || !forecast.hourly || !forecast.daily) return;

        var hourly = forecast.hourly;
        var daily  = forecast.daily;

        var totalPrecip = 0, maxPrecip = 0, jamPuncak = '-';
        var namaWaktu = '';

        for (var i = activeIdx; i < Math.min(activeIdx + 24, hourly.time.length); i++) {
            var p = (hourly.precipitation && hourly.precipitation[i]) || 0;
            totalPrecip += p;
            if (p > maxPrecip) {
                maxPrecip = p;
                var strWaktu = (hourly.time[i] || '').split('T')[1];
                if (strWaktu) {
                    var jam = parseInt(strWaktu.substring(0, 2), 10);
                    var sebutan = jam >= 0  && jam < 5  ? 'Dini Hari' :
                                  jam >= 5  && jam < 10 ? 'Pagi'      :
                                  jam >= 10 && jam < 15 ? 'Siang'     :
                                  jam >= 15 && jam < 19 ? 'Sore'      : 'Malam';
                    jamPuncak = sebutan + ' (' + strWaktu.substring(0, 5) + ')';
                    namaWaktu = 'pada ';
                }
            }
        }

        var warna, ikon, status, saran;

        if (maxPrecip >= 10) {
            warna = '#ef4444'; ikon = '🌧️';
            status = 'Potensi Hujan Lebat Hari Ini';
            saran  = 'Selesaikan pekerjaan sawah sebelum ' + jamPuncak + '. Pastikan saluran drainase terbuka.';
        } else if (maxPrecip >= 2.5) {
            warna = '#f59e0b'; ikon = '🌦️';
            status = 'Hujan Ringan–Sedang Diprediksi';
            saran  = 'Tunda pemupukan jika hujan turun agar tidak tercuci.';
        } else if (maxPrecip >= 0.5) {
            warna = '#84cc16'; ikon = '🌦️';
            status = 'Gerimis Mungkin Terjadi';
            saran  = 'Kondisi relatif aman untuk ke lahan.';
        } else {
            var KODE_AWAN_HUJAN = [51,53,55,61,63,65,80,81,82,95,96,99];
            var wCodeHarian = (daily.weather_code && daily.weather_code[0]) || 0;
            if (KODE_AWAN_HUJAN.indexOf(wCodeHarian) > -1) {
                warna = '#3b82f6'; ikon = '⛅';
                status = 'Awan Hujan di Sekitar, Titik Sawah Relatif Aman';
                saran  = 'Awan mendung terdeteksi di wilayah kecamatan, namun curah hujan di titik sawah Anda diprediksi nihil (0.0 mm). Tetap pantau langit.';
            } else {
                warna = '#10b981'; ikon = '☀️';
                status = 'Cuaca Cerah Mendukung Kerja di Lahan';
                saran  = 'Waktu terbaik untuk melakukan pemupukan atau penyemprotan.';
            }
        }

        // Siapkan HTML Konten
        var isiHTML = 
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<span style="font-size:1.4rem;">' + ikon + '</span>' +
                '<b style="color:' + warna + ';font-size:.9rem;">' + status + '</b>' +
            '</div>' +
            '<div style="font-size:.8rem;color:#94a3b8;line-height:1.6;">' + saran + '</div>' +
            (maxPrecip > 0
                ? '<div style="margin-top:8px;font-size:.72rem;color:#64748b;">' +
                    '💧 Estimasi total air hari ini: <b style="color:#cbd5e1;">' + totalPrecip.toFixed(1) + ' mm</b>' +
                    (jamPuncak !== '-' ? ' | Puncak: ' + namaWaktu + '<b style="color:#cbd5e1;">' + jamPuncak + '</b>' : '') +
                  '</div>'
                : '');

        var elemenSudahAda = document.getElementById('ringkasanSituasiCuaca');

        if (elemenSudahAda) {
            // JIKA SUDAH ADA: Cukup update isinya, jangan di-remove agar tidak berkedip
            elemenSudahAda.innerHTML = isiHTML;
            elemenSudahAda.style.borderLeftColor = warna;
        } else {
            // JIKA BELUM ADA: Buat elemen baru dengan animasi lcFadeUp
            var el = document.createElement('div');
            el.id = 'ringkasanSituasiCuaca';
            el.style.cssText =
                'background:rgba(0,0,0,.12);border-radius:16px;padding:14px 16px;' +
                'margin-bottom:16px;border-left:4px solid ' + warna + ';' +
                'animation:lcFadeUp .4s ease;';
            el.innerHTML = isiHTML;

            var elJudul = document.querySelector('.forecast-title');
            if (elJudul) {
                elJudul.parentNode.insertBefore(el, elJudul);
            } else {
                var wd = document.getElementById('weatherData');
                if (wd) wd.prepend(el);
            }
        }
    }
    // =========================================================================
    //  OBSERVER — jalankan semua perbaikan dengan aman tanpa infinite loop
    // =========================================================================

    var _timeoutRef = null;

    function jalankanPerbaikan() {
        var forecast  = window._lastForecastData;
        var activeIdx = window._activeIndexCuaca;

        if (!forecast || typeof activeIdx !== 'number') return;

        perbaruiTampilanPrediksiAtmosfer(forecast, activeIdx);
        tambahKeteranganPrakiraan();
        perbaruiIkonPerJam(forecast.hourly, activeIdx);
        tambahRingkasanSituasi(forecast, activeIdx);
    }

    function pasangObserver() {
        var target = document.getElementById('hourlyForecastContainer');
        if (!target) { setTimeout(pasangObserver, 500); return; }

        var obs = new MutationObserver(function () {
            var kartu = target.querySelectorAll('.hourly-card');
            var terisi = 0;
            kartu.forEach(function(k) {
                var t = k.querySelector('.temp');
                if (t && t.textContent && t.textContent.indexOf('°') > -1) terisi++;
            });
            if (terisi < 3) return;

            // Bersihkan timer sebelumnya (Debounce)
            if (_timeoutRef) clearTimeout(_timeoutRef);

            _timeoutRef = setTimeout(function() {
                // 1. Matikan observer sementara agar modifikasi DOM kita tidak memicu loop
                obs.disconnect();

                // 2. Jalankan modifikasi DOM
                jalankanPerbaikan();

                // 3. Nyalakan kembali observer setelah selesai
                obs.observe(target, { childList: true, subtree: true });
            }, 350);
        });

        obs.observe(target, { childList: true, subtree: true });
    }

    pasangObserver();

    console.log('%c✅ patch_konsistensi_cuaca_v2.js aktif — klasifikasiCuacaGabungan + ikon per jam + ringkasan situasi', 'color:#3b82f6;font-weight:bold;');

})();
