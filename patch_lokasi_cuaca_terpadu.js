/**
 * ============================================================
 *  PATCH: Lokasi Cuaca Terpadu
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 3.0
 * ============================================================
 *
 *  FITUR:
 *  1. AUTO-DETECT lokasi via BTS/WiFi/IP saat tab Risiko Cuaca dibuka
 *  2. SINKRON GPS AKURAT — tombol untuk tingkatkan presisi ke GPS satelit
 *  3. LOKASI MANUAL via peta Leaflet — klik/geser marker, reverse geocode
 *  4. Semua path (auto, GPS, manual) menampilkan:
 *     - Parameter cuaca lengkap (suhu, hujan, CAPE, dll.)
 *     - Prakiraan per jam & 7 hari
 *     - Risiko penyakit & hama (Blast, Sheath Blight, WBC, Tungro, PBP, Tikus)
 *     - Proyeksi iklim ENSO/IOD/SST
 *  5. Nilai input tanggal tanam & varietas TIDAK terhapus saat render ulang
 *  6. Panel peta manual bisa dibuka/tutup kapan saja
 *
 *  CARA PASANG (gantikan semua patch lokasi/cuaca sebelumnya):
 *  Taruh SATU baris ini di HTML, setelah patch_risiko_iklim.js:
 *
 *    <script src="patch_lokasi_cuaca_terpadu.js"></script>
 *
 *  Hapus (atau biarkan — patch ini aman jika berjalan bersamaan):
 *    patch_cuaca_langsung.js
 *    patch_lokasi_manual.js
 *    patch_akurasi_cuaca_v1.js
 *    patch_konsistensi_cuaca_v1.js
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONSTANTA
    // =========================================================================

    var FALLBACK_LOK = {
        lat: -3.9264, lon: 120.0275,
        label: 'Kab. Wajo, Sulawesi Selatan',
        akurasi: 'fallback'
    };

    var HARI_ID  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var ARAH_ID  = ['Utara','Timur Laut','Timur','Tenggara','Selatan','Barat Daya','Barat','Barat Laut'];

    // =========================================================================
    //  STATE GLOBAL PATCH
    // =========================================================================

    var S = {
        koordinat      : null,
        forecast       : null,
        archive        : null,
        sedangMemuat   : false,
        gpsAktif       : false,
        btsDicoba      : false,
        mapInstance    : null,
        markerInstance : null,
        panelPetaTerbuka: false,
        // input yang harus survive render ulang
        inputTgl       : '',
        inputVar       : 'sedang'
    };

    // =========================================================================
    //  CSS
    // =========================================================================

    (function injectCSS() {
        var style = document.createElement('style');
        style.textContent = [
            /* animasi */
            '@keyframes lcFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
            '@keyframes lcPulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.7)}70%{box-shadow:0 0 0 12px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}',

            /* kotak info lokasi */
            '#lcInfoLokasi{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);',
            'border-radius:14px;padding:12px 14px;margin-bottom:12px;',
            'display:flex;justify-content:space-between;align-items:center;gap:10px;',
            'animation:lcFadeUp .4s ease;}',

            /* baris tombol aksi */
            '#lcBtnRow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}',

            /* tombol GPS */
            '#lcBtnGPS{padding:12px 8px;border:none;border-radius:12px;font-weight:700;',
            'font-size:.8rem;cursor:pointer;font-family:inherit;letter-spacing:.3px;',
            'display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;}',
            '#lcBtnGPS.aktif{background:linear-gradient(135deg,#10b981,#059669);color:#fff;}',
            '#lcBtnGPS.idle{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;animation:lcPulse 2s infinite;}',
            '#lcBtnGPS.error{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;}',
            '#lcBtnGPS:active{transform:scale(.97);opacity:.88;}',

            /* tombol peta manual */
            '#lcBtnPeta{padding:12px 8px;border:1px solid rgba(34,211,238,.4);border-radius:12px;',
            'background:rgba(34,211,238,.08);color:#22d3ee;font-weight:700;font-size:.8rem;',
            'cursor:pointer;font-family:inherit;letter-spacing:.3px;',
            'display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;}',
            '#lcBtnPeta:active{transform:scale(.97);}',
            '#lcBtnPeta.terbuka{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.4);color:#ef4444;}',

            /* panel peta manual */
            '#lcPanelPeta{display:none;margin-bottom:12px;background:rgba(34,211,238,.04);',
            'border:1px solid rgba(34,211,238,.15);border-radius:14px;padding:14px;',
            'animation:lcFadeUp .35s ease;}',
            '#lcMapEl{height:220px;border-radius:10px;overflow:hidden;',
            'border:1px solid rgba(255,255,255,.08);margin-bottom:10px;}',
            '#lcCariKotaRow{display:flex;gap:8px;margin-bottom:10px;}',
            '#lcCariKotaRow input{flex:1;background:#111c2e;border:1px solid rgba(255,255,255,.06);',
            'border-radius:10px;padding:10px 12px;color:#fff;font-size:.82rem;font-family:inherit;}',
            '#lcBtnCariKota{flex-shrink:0;padding:10px 14px;background:linear-gradient(135deg,#3b82f6,#2563eb);',
            'color:#fff;border:none;border-radius:10px;font-weight:700;font-size:.78rem;',
            'cursor:pointer;font-family:inherit;white-space:nowrap;}',
            '#lcBtnTerapkanPeta{width:100%;padding:11px;background:linear-gradient(135deg,#10b981,#059669);',
            'color:#fff;border:none;border-radius:10px;font-weight:700;font-size:.82rem;',
            'cursor:pointer;font-family:inherit;margin-top:6px;}',
            '#lcBtnTerapkanPeta:active{transform:scale(.98);}',

            /* input tanggal & varietas */
            '#lcInputRow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}',

            /* box risiko */
            '.lc-risiko-box{animation:lcFadeUp .45s ease;}',

            /* light mode */
            'body.light-mode #lcInfoLokasi{background:rgba(59,130,246,.06)!important;}',
            'body.light-mode #lcPanelPeta{background:rgba(34,211,238,.03)!important;}',
            'body.light-mode #lcCariKotaRow input{background:#f8fafc!important;color:#0f172a!important;border-color:#94a3b8!important;}',
        ].join('');
        document.head.appendChild(style);
    })();

    // =========================================================================
    //  UTILITAS
    // =========================================================================

    function tglMinus(hari) {
        var d = new Date();
        d.setDate(d.getDate() - hari);
        return d.toISOString().split('T')[0];
    }

    async function fetchRetry(url, maxCoba, jedaMs) {
        maxCoba = maxCoba || 3; jedaMs = jedaMs || 1500;
        for (var i = 0; i < maxCoba; i++) {
            try {
                var ctrl = new AbortController();
                var t = setTimeout(function () { ctrl.abort(); }, 20000);
                var res = await fetch(url, { signal: ctrl.signal });
                clearTimeout(t);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.json();
            } catch (e) {
                if (i < maxCoba - 1) await new Promise(function (r) { setTimeout(r, jedaMs); });
                else throw e;
            }
        }
    }

    async function reverseGeocode(lat, lon) {
        try {
            var res = await fetch(
                'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon,
                { headers: { 'User-Agent': 'SmartFarming-PPLWajo/3.0' } }
            );
            if (!res.ok) return null;
            var d = await res.json();
            var a = d.address || {};
            var desa = a.village || a.suburb || a.hamlet || a.town || 'Lokasi';
            var kab  = a.county  || a.city   || a.municipality || '';
            return desa + (kab ? ', Kab. ' + kab : '');
        } catch (e) { return null; }
    }

    async function geocodeNama(nama) {
        var res = await fetchRetry(
            'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
            encodeURIComponent(nama) + '&countrycodes=id', 1, 0
        );
        if (!res || !res.length) throw new Error('Lokasi "' + nama + '" tidak ditemukan.');
        return { lat: parseFloat(res[0].lat), lon: parseFloat(res[0].lon), label: res[0].display_name };
    }

    function cuacaDariKode(code) {
        if (code === 0)                                         return { ikon:'☀️', teks:'Cerah' };
        if ([1,2,3].indexOf(code) > -1)                        return { ikon:'☁️', teks:'Berawan' };
        if ([45,48].indexOf(code) > -1)                        return { ikon:'🌫️', teks:'Berkabut' };
        if ([51,53,55].indexOf(code) > -1)                     return { ikon:'🌥️', teks:'Gerimis Tipis' };
        if ([61,63,80,81].indexOf(code) > -1)                  return { ikon:'🌧️', teks:'Hujan Ringan-Sedang' };
        if ([65,82].indexOf(code) > -1)                        return { ikon:'🌧️', teks:'Hujan Lebat' };
        if ([95,96,99].indexOf(code) > -1)                     return { ikon:'⛈️', teks:'Badai Petir' };
        return { ikon:'⛅', teks:'Berawan' };
    }

    function set(id, val) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = val;
    }

    // =========================================================================
    //  SIMPAN & RESTORE INPUT (tanggal tanam & varietas)
    // =========================================================================

    function simpanInput() {
        var tEl = document.getElementById('tglTanamCuaca');
        var vEl = document.getElementById('umurVarietasCuaca');
        if (tEl && tEl.value) S.inputTgl = tEl.value;
        if (vEl && vEl.value) S.inputVar = vEl.value;
    }

    function restoreInput() {
        var tEl = document.getElementById('tglTanamCuaca');
        var vEl = document.getElementById('umurVarietasCuaca');
        if (tEl && S.inputTgl) tEl.value = S.inputTgl;
        if (vEl && S.inputVar) vEl.value = S.inputVar;
        // fallback localStorage
        try {
            var la = JSON.parse(localStorage.getItem('sf_lahan_aktif') || 'null');
            if (la) {
                if (tEl && !tEl.value && la.tglTanam)     tEl.value = la.tglTanam;
                if (vEl && vEl.value === 'sedang' && la.varietasUmur) vEl.value = la.varietasUmur;
            }
        } catch(e) {}
        pasangListenerInput();
    }

    function pasangListenerInput() {
        var tEl = document.getElementById('tglTanamCuaca');
        var vEl = document.getElementById('umurVarietasCuaca');
        if (tEl && !tEl._lcListened) {
            tEl._lcListened = true;
            tEl.addEventListener('change', function () { S.inputTgl = tEl.value; });
            tEl.addEventListener('input',  function () { S.inputTgl = tEl.value; });
        }
        if (vEl && !vEl._lcListened) {
            vEl._lcListened = true;
            vEl.addEventListener('change', function () { S.inputVar = vEl.value; });
        }
    }

    // =========================================================================
    //  RENDER UI PANEL GPS (gpsPrompt)
    // =========================================================================

    function renderPanelGPS(koordinat) {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) return;

        simpanInput(); // WAJIB sebelum innerHTML diganti

        var warnaNama, ikonStatus, labelStatus;
        if (koordinat.akurasi === 'gps') {
            warnaNama   = '#10b981';
            ikonStatus  = '🛰️';
            labelStatus = '<span style="color:#10b981;">✅ GPS Akurat — Analisis risiko aktif</span>';
        } else if (koordinat.akurasi === 'bts') {
            warnaNama   = '#f59e0b';
            ikonStatus  = '📡';
            labelStatus = '<span style="color:#f59e0b;">⚠️ Sinyal BTS/WiFi — Tekan <b>Tingkatkan Akurasi</b> untuk lokasi sawah tepat</span>';
        } else {
            warnaNama   = '#64748b';
            ikonStatus  = '🌐';
            labelStatus = '<span style="color:#64748b;">🌐 Estimasi wilayah — Tekan GPS atau atur lokasi manual</span>';
        }

        var kelasGPS = koordinat.akurasi === 'gps' ? 'aktif' : 'idle';
        var teksGPS  = koordinat.akurasi === 'gps'
            ? '<span>✅</span><span>GPS AKURAT — PERBARUI</span>'
            : '<span>🛰️</span><span>TINGKATKAN AKURASI GPS</span>';

        gpsPrompt.innerHTML =
            // ── kotak info lokasi ──────────────────────────────────────────
            '<div id="lcInfoLokasi">' +
                '<div style="min-width:0;">' +
                    '<div style="font-size:.68rem;font-weight:700;color:#64748b;letter-spacing:1px;margin-bottom:3px;">📍 LOKASI AKTIF</div>' +
                    '<div id="lcNamaLokasi" style="font-size:.88rem;font-weight:700;color:' + warnaNama + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + koordinat.label + '</div>' +
                    '<div id="lcStatusLokasi" style="font-size:.7rem;font-weight:600;margin-top:3px;">' + labelStatus + '</div>' +
                '</div>' +
                '<span style="font-size:1.6rem;flex-shrink:0;">' + ikonStatus + '</span>' +
            '</div>' +

            // ── input tanggal & varietas ───────────────────────────────────
            '<div id="lcInputRow">' +
                '<div>' +
                    '<label style="font-size:.68rem;color:#64748b;font-weight:700;display:block;margin-bottom:4px;">📅 TGL TANAM</label>' +
                    '<input type="date" id="tglTanamCuaca" class="form-input" style="margin-bottom:0;padding:10px;font-size:.8rem;">' +
                '</div>' +
                '<div>' +
                    '<label style="font-size:.68rem;color:#64748b;font-weight:700;display:block;margin-bottom:4px;">🌱 VARIETAS</label>' +
                    '<select id="umurVarietasCuaca" class="form-select" style="margin-bottom:0;padding:10px;font-size:.8rem;">' +
                        '<option value="genjah">Genjah (&lt;95 HST)</option>' +
                        '<option value="sedang" selected>Sedang (95-115)</option>' +
                        '<option value="dalam">Dalam (≥116 HST)</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +

            // ── baris tombol ───────────────────────────────────────────────
            '<div id="lcBtnRow">' +
                '<button id="lcBtnGPS" class="' + kelasGPS + '" onclick="window.lcSinkronGPS()">' +
                    teksGPS +
                '</button>' +
                '<button id="lcBtnPeta" onclick="window.lcTogglePeta()">' +
                    '<span>🗺️</span><span>LOKASI MANUAL</span>' +
                '</button>' +
            '</div>' +

            // ── panel peta manual (tersembunyi) ────────────────────────────
            '<div id="lcPanelPeta">' +
                '<div style="font-size:.72rem;font-weight:700;color:#22d3ee;margin-bottom:8px;letter-spacing:.5px;">📍 ATUR LOKASI SAWAH SECARA MANUAL</div>' +
                '<div id="lcCariKotaRow">' +
                    '<input type="text" id="lcInputKota" placeholder="Cari kota / kecamatan / desa…">' +
                    '<button id="lcBtnCariKota" onclick="window.lcCariKota()">🔍 Cari</button>' +
                '</div>' +
                '<div id="lcMapEl"></div>' +
                '<div style="font-size:.7rem;color:#475569;margin-bottom:8px;line-height:1.5;">' +
                    'Klik titik sawah di peta atau geser marker ke posisi yang tepat, lalu tekan tombol di bawah.' +
                '</div>' +
                '<button id="lcBtnTerapkanPeta" onclick="window.lcTerapkanPeta()">✅ TERAPKAN LOKASI INI & MUAT CUACA</button>' +
            '</div>' +

            // ── hint ───────────────────────────────────────────────────────
            '<div style="font-size:.7rem;color:#38b6ff;text-align:center;line-height:1.5;padding:0 8px;margin-top:6px;">' +
                'Cuaca & risiko hama/penyakit otomatis muncul setelah lokasi terdeteksi.' +
            '</div>';

        restoreInput(); // WAJIB setelah innerHTML diganti
    }

    // =========================================================================
    //  INISIALISASI PETA LEAFLET (panel manual)
    // =========================================================================

    function inisialisasiPeta(lat, lon) {
        if (typeof L === 'undefined') {
            document.getElementById('lcMapEl').innerHTML =
                '<div style="padding:20px;text-align:center;color:#64748b;font-size:.8rem;">⚠️ Leaflet belum dimuat</div>';
            return;
        }
        if (S.mapInstance) {
            S.mapInstance.setView([lat, lon], 15);
            if (S.markerInstance) S.markerInstance.setLatLng([lat, lon]);
            setTimeout(function () { S.mapInstance.invalidateSize(); }, 200);
            return;
        }

        S.mapInstance = L.map('lcMapEl', { zoomControl: true, attributionControl: false })
            .setView([lat, lon], 15);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 22, maxNativeZoom: 21 }).addTo(S.mapInstance);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { maxZoom: 19, opacity: 0.35 }).addTo(S.mapInstance);

        S.markerInstance = L.marker([lat, lon], { draggable: true }).addTo(S.mapInstance)
            .bindPopup('Geser ke lokasi sawah').openPopup();

        S.markerInstance.on('dragend', async function () {
            var ll = S.markerInstance.getLatLng();
            var el = document.getElementById('lcInputKota');
            if (el) el.value = ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5);
            var nama = await reverseGeocode(ll.lat, ll.lng);
            if (el && nama) el.value = nama;
        });

        S.mapInstance.on('click', async function (e) {
            S.markerInstance.setLatLng(e.latlng);
            var el = document.getElementById('lcInputKota');
            if (el) el.value = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
            var nama = await reverseGeocode(e.latlng.lat, e.latlng.lng);
            if (el && nama) el.value = nama;
        });

        setTimeout(function () { S.mapInstance.invalidateSize(); }, 250);
    }

    // =========================================================================
    //  TOGGLE PANEL PETA
    // =========================================================================

    window.lcTogglePeta = function () {
        S.panelPetaTerbuka = !S.panelPetaTerbuka;
        var panel = document.getElementById('lcPanelPeta');
        var btn   = document.getElementById('lcBtnPeta');
        if (!panel) return;

        if (S.panelPetaTerbuka) {
            panel.style.display = 'block';
            if (btn) { btn.classList.add('terbuka'); btn.innerHTML = '<span>✕</span><span>TUTUP PETA</span>'; }
            var lat = S.koordinat ? S.koordinat.lat : FALLBACK_LOK.lat;
            var lon = S.koordinat ? S.koordinat.lon : FALLBACK_LOK.lon;
            setTimeout(function () { inisialisasiPeta(lat, lon); }, 100);
        } else {
            panel.style.display = 'none';
            if (btn) { btn.classList.remove('terbuka'); btn.innerHTML = '<span>🗺️</span><span>LOKASI MANUAL</span>'; }
        }
    };

    // =========================================================================
    //  CARI KOTA VIA NOMINATIM
    // =========================================================================

    window.lcCariKota = async function () {
        var el  = document.getElementById('lcInputKota');
        var btn = document.getElementById('lcBtnCariKota');
        var nama = (el ? el.value : '').trim();
        if (!nama) { alert('Masukkan nama kota/kecamatan/desa'); return; }
        if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
        try {
            var hasil = await geocodeNama(nama);
            if (S.mapInstance) {
                S.mapInstance.setView([hasil.lat, hasil.lon], 15);
                if (S.markerInstance) S.markerInstance.setLatLng([hasil.lat, hasil.lon]);
            }
            if (el) el.value = hasil.label.split(',').slice(0, 2).join(',');
        } catch (e) { alert(e.message); }
        finally { if (btn) { btn.disabled = false; btn.textContent = '🔍 Cari'; } }
    };

    // =========================================================================
    //  TERAPKAN LOKASI DARI PETA
    // =========================================================================

    window.lcTerapkanPeta = async function () {
        var btn = document.getElementById('lcBtnTerapkanPeta');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses…'; }

        try {
            var ll = S.markerInstance
                ? S.markerInstance.getLatLng()
                : (S.koordinat ? { lat: S.koordinat.lat, lng: S.koordinat.lon } : { lat: FALLBACK_LOK.lat, lng: FALLBACK_LOK.lon });

            var lat = ll.lat, lon = ll.lng || ll.lon;
            var label = await reverseGeocode(lat, lon) || (lat.toFixed(5) + ', ' + lon.toFixed(5));

            S.koordinat = { lat: lat, lon: lon, label: label, akurasi: 'manual' };
            window._koordinatTerakhir = { coords: { latitude: lat, longitude: lon, accuracy: 500 } };

            // tutup panel peta
            S.panelPetaTerbuka = true;
            window.lcTogglePeta();

            // muat cuaca + risiko
            S.sedangMemuat = false;
            await muatCuaca(S.koordinat, true);

        } catch (e) {
            alert('Gagal menerapkan lokasi: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✅ TERAPKAN LOKASI INI & MUAT CUACA'; }
        }
    };

    // =========================================================================
    //  SINKRON GPS AKURAT
    // =========================================================================

    window.lcSinkronGPS = async function () {
        var btn = document.getElementById('lcBtnGPS');

        simpanInput();

        if (btn) {
            btn.disabled = true;
            btn.className = 'idle';
            btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span><span>MENCARI GPS…</span>';
        }

        try {
            var pos = await new Promise(function (resolve, reject) {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    function () {
                        navigator.geolocation.getCurrentPosition(resolve, reject,
                            { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
            });

            window._koordinatTerakhir = pos;
            var lat = pos.coords.latitude;
            var lon = pos.coords.longitude;

            if (btn) btn.innerHTML = '<span>⏳</span><span>MENDAPATKAN NAMA…</span>';
            var label = await reverseGeocode(lat, lon) || (lat.toFixed(5) + ', ' + lon.toFixed(5));

            S.koordinat = { lat: lat, lon: lon, label: label, akurasi: 'gps' };
            S.gpsAktif  = true;

            if (btn) {
                btn.disabled  = false;
                btn.className = 'aktif';
                btn.innerHTML = '<span>✅</span><span>GPS AKURAT — PERBARUI</span>';
            }

            // perbarui nama lokasi di UI tanpa render ulang total
            var namaEl   = document.getElementById('lcNamaLokasi');
            var statusEl = document.getElementById('lcStatusLokasi');
            if (namaEl)   namaEl.innerHTML = label;
            if (statusEl) statusEl.innerHTML = '<span style="color:#10b981;">✅ GPS Akurat — Analisis risiko aktif</span>';

            // perbarui marker peta jika terbuka
            if (S.mapInstance && S.markerInstance) {
                S.markerInstance.setLatLng([lat, lon]);
                S.mapInstance.setView([lat, lon], 16);
            }

            S.sedangMemuat = false;
            await muatCuaca(S.koordinat, true);

        } catch (err) {
            console.warn('[lc] GPS gagal:', err);
            if (btn) {
                btn.disabled  = false;
                btn.className = 'error';
                btn.innerHTML = '<span>❌</span><span>GPS GAGAL — COBA LAGI</span>';
                setTimeout(function () {
                    btn.className = 'idle';
                    btn.innerHTML = '<span>🛰️</span><span>TINGKATKAN AKURASI GPS</span>';
                }, 4000);
            }
        }
    };

    // =========================================================================
    //  FETCH DATA CUACA
    // =========================================================================

    async function fetchCuaca(lat, lon) {
        var urlF =
            'https://api.open-meteo.com/v1/forecast' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&current=rain,temperature_2m,relative_humidity_2m,dew_point_2m,' +
            'wind_speed_10m,wind_direction_10m,surface_pressure,weather_code' +
            '&hourly=precipitation_probability,precipitation,temperature_850hPa,' +
            'cape,temperature_2m,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
            'precipitation_sum,precipitation_probability_max,wind_speed_10m_max' +
            '&forecast_days=7&timezone=auto';

        var urlA =
            'https://archive-api.open-meteo.com/v1/archive' +
            '?latitude=' + lat + '&longitude=' + lon +
            '&start_date=' + tglMinus(30) + '&end_date=' + tglMinus(1) +
            '&daily=precipitation_sum&timezone=auto';

        var hasil = await Promise.all([
            fetchRetry(urlF),
            fetchRetry(urlA).catch(function () { return { daily: { precipitation_sum: [] } }; })
        ]);
        return { forecast: hasil[0], archive: hasil[1] };
    }

    // =========================================================================
    //  RENDER SKELETON
    // =========================================================================

    function renderSkeleton() {
        var ids = ['rainNow','rainMonthly','suhuNow','humidityNow','windNow',
                   'pressNow','tempUpper','dpSpread','capeVal','windDir'];
        ids.forEach(function (id) {
            set(id, '<span style="background:#1e2f45;border-radius:4px;display:inline-block;width:65px;height:13px;opacity:.5;"></span>');
        });

        var hBox = document.getElementById('hourlyForecastContainer');
        if (hBox) hBox.innerHTML = [0,1,2,3,4,5,6,7].map(function () {
            return '<div class="hourly-card" style="opacity:.4;">' +
                '<div style="background:#1e2f45;border-radius:5px;height:11px;width:34px;margin:0 auto 7px;"></div>' +
                '<div style="background:#1e2f45;border-radius:50%;height:26px;width:26px;margin:0 auto 7px;"></div>' +
                '<div style="background:#1e2f45;border-radius:5px;height:12px;width:32px;margin:0 auto;"></div>' +
                '</div>';
        }).join('');

        var dBox = document.getElementById('dailyForecastContainer');
        if (dBox) dBox.innerHTML = [0,1,2,3,4,5,6].map(function () {
            return '<div class="daily-item">' +
                '<div style="background:#1e2f45;border-radius:5px;height:12px;width:55px;"></div>' +
                '<div style="background:#1e2f45;border-radius:5px;height:16px;width:20px;margin:0 auto;"></div>' +
                '<div style="background:#1e2f45;border-radius:5px;height:12px;width:60px;margin-left:auto;"></div>' +
                '</div>';
        }).join('');
    }

    // =========================================================================
    //  RENDER DATA CUACA
    // =========================================================================

    function renderCuaca(forecast, archive, koordinat) {
        var cur    = forecast.current;
        var hourly = forecast.hourly;
        var daily  = forecast.daily;

        // ── index waktu aktif (terdekat ke sekarang) ──────────────────────
        var now = Date.now();
        var idx = 0, selisihMin = Infinity;
        for (var i = 0; i < hourly.time.length; i++) {
            var s = Math.abs(new Date(hourly.time[i]).getTime() - now);
            if (s < selisihMin) { selisihMin = s; idx = i; }
        }

        // ── simpan ke global (dipakai patch lain) ─────────────────────────
        window._lastForecastData  = forecast;
        window._activeIndexCuaca  = idx;
        window._sumberDataCuacaAktif = 'openmeteo';

        // ── lokasi ────────────────────────────────────────────────────────
        var lokasiEl = document.getElementById('lokasiSawah');
        var alamatEl = document.getElementById('alamatDesa');
        if (lokasiEl) lokasiEl.innerText = koordinat.lat.toFixed(5) + ', ' + koordinat.lon.toFixed(5);
        if (alamatEl) {
            var warnaB = { gps:'#10b981', bts:'#f59e0b', manual:'#22d3ee' }[koordinat.akurasi] || '#64748b';
            var labelB = { gps:'🛰️ GPS Akurat', bts:'📡 BTS/WiFi', manual:'📍 Manual', fallback:'🌐 Estimasi' }[koordinat.akurasi] || '🌐';
            alamatEl.innerHTML = '<b>' + koordinat.label + '</b>' +
                '<span style="display:inline-block;margin-left:8px;font-size:.7rem;padding:2px 8px;' +
                'border-radius:6px;background:rgba(255,255,255,.08);color:' + warnaB + ';">' + labelB + '</span>';
        }

        // ── prakiraan per jam ─────────────────────────────────────────────
        var hBox = document.getElementById('hourlyForecastContainer');
        if (hBox) {
            hBox.innerHTML = '';
            for (var j = idx; j < idx + 12 && j < hourly.time.length; j++) {
                var jam = hourly.time[j].split('T')[1].substring(0, 5);
                var cj  = cuacaDariKode(hourly.weather_code[j]);
                hBox.innerHTML +=
                    '<div class="hourly-card">' +
                    '<div class="time">' + jam + '</div>' +
                    '<div class="icon" title="' + cj.teks + '">' + cj.ikon + '</div>' +
                    '<div class="temp">' + hourly.temperature_2m[j].toFixed(0) + '°C</div>' +
                    '</div>';
            }
        }

        // ── prakiraan 7 hari ──────────────────────────────────────────────
        var dBox = document.getElementById('dailyForecastContainer');
        if (dBox) {
            dBox.innerHTML = '';
            daily.time.forEach(function (tgl, k) {
                var p = tgl.split('-').map(Number);
                var hari = k === 0 ? 'Hari Ini' : HARI_ID[new Date(p[0], p[1]-1, p[2]).getDay()];
                var cd   = cuacaDariKode(daily.weather_code[k]);
                var maks = daily.temperature_2m_max[k].toFixed(0);
                var min  = daily.temperature_2m_min[k].toFixed(0);
                var hj   = (daily.precipitation_sum && daily.precipitation_sum[k] != null) ? daily.precipitation_sum[k].toFixed(1) : '0';
                var prob = (daily.precipitation_probability_max && daily.precipitation_probability_max[k] != null) ? daily.precipitation_probability_max[k] : 0;
                var angin = (daily.wind_speed_10m_max && daily.wind_speed_10m_max[k] != null) ? daily.wind_speed_10m_max[k].toFixed(0) : '-';
                dBox.innerHTML +=
                    '<div class="daily-item" style="grid-template-columns:2fr 1fr 2fr;align-items:start;padding:12px 4px;">' +
                    '<div class="day">' + hari + '</div>' +
                    '<div class="icon" title="' + cd.teks + '">' + cd.ikon + '</div>' +
                    '<div style="text-align:right;">' +
                        '<div class="temp-range">' + min + '°/' + maks + '°C</div>' +
                        '<div style="font-size:.7rem;color:#38b6ff;margin-top:3px;">💧' + hj + 'mm | ' + prob + '%</div>' +
                        '<div style="font-size:.7rem;color:#94a3b8;">💨' + angin + ' km/j</div>' +
                    '</div>' +
                    '</div>';
            });
        }

        // ── parameter real-time ───────────────────────────────────────────
        var dp   = (cur.temperature_2m - cur.dew_point_2m).toFixed(1);
        var cape = hourly.cape ? (hourly.cape[idx] || 0) : 0;
        var t850 = hourly.temperature_850hPa ? hourly.temperature_850hPa[idx] : '-';

        set('dpSpread',    dp + ' °C');
        set('suhuNow',     cur.temperature_2m + ' °C');
        set('humidityNow', cur.relative_humidity_2m + '%');
        set('windNow',     cur.wind_speed_10m + ' km/jam');
        set('pressNow',    cur.surface_pressure + ' hPa');
        set('tempUpper',   t850 + ' °C');

        var capeSt = cape > 2500 ? '‼️ EKSTREM' : (cape > 1000 ? '⚠️ WASPADA' : '✅ STABIL');
        set('capeVal', cape + ' J/kg<br><small>Status: ' + capeSt + '</small>');

        var listHj = (archive.daily || {}).precipitation_sum || [];
        var totalBln = listHj.reduce(function (t, v) { return t + (v || 0); }, 0);

        // FIX: gunakan hourly.precipitation[idx] sebagai sumber primer
        var rainJam = (hourly.precipitation && typeof hourly.precipitation[idx] === 'number')
            ? hourly.precipitation[idx] : (cur.rain || 0);
        set('rainNow',     rainJam.toFixed(1) + ' mm/jam');
        set('rainMonthly', '<b>' + totalBln.toFixed(1) + ' mm</b>');

        var arahIdx = Math.round(cur.wind_direction_10m / 45) % 8;
        set('windDir',
            '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;">' +
            '<span style="transform:rotate(' + (cur.wind_direction_10m+180) + 'deg)">⬆️</span>' +
            '<span>Dari ' + ARAH_ID[arahIdx] + '</span></div>');

        // ── prediksi atmosfer (skor presipitasi) ──────────────────────────
        var idxNext = Math.min(idx + 1, hourly.time.length - 1);
        var prob2   = hourly.precipitation_probability ? (hourly.precipitation_probability[idxNext] || 0) : 0;
        var precipNext = hourly.precipitation ? (hourly.precipitation[idxNext] || 0) : 0;
        var skor = Math.round((prob2 / 100) * 35);
        if (precipNext >= 10)   skor += 25;
        else if (precipNext >= 2.5) skor += 15;
        else if (precipNext >= 0.5) skor += 8;
        if (cape >= 2500)       skor += 25;
        else if (cape >= 1500)  skor += 18;
        else if (cape >= 800)   skor += 10;
        if (parseFloat(dp) <= 1) skor += 12;
        else if (parseFloat(dp) <= 2) skor += 6;
        if (cur.relative_humidity_2m >= 95) skor += 8;
        else if (cur.relative_humidity_2m >= 88) skor += 4;
        // validator silang: cerah murni batasi skor
        if ([0,1].indexOf(cur.weather_code || 0) > -1 && precipNext < 0.1 && skor > 45) skor = 45;
        skor = Math.max(0, Math.min(100, skor));

        var boxHj = document.getElementById('prediksiHujan');
        var txtHj = document.getElementById('hujanNext');
        if (boxHj && txtHj) {
            boxHj.style.display = 'block';
            var ikonHj, labelHj, warnaHj;
            if (skor >= 70) { ikonHj = '⛈️'; labelHj = 'Hujan Sangat Mungkin'; warnaHj = 'var(--red-alert)'; }
            else if (skor >= 45) { ikonHj = '🌧️'; labelHj = 'Potensi Hujan Sedang-Lebat'; warnaHj = '#f97316'; }
            else if (skor >= 30) { ikonHj = '🌦️'; labelHj = 'Kemungkinan Gerimis'; warnaHj = 'var(--accent-soil)'; }
            else { ikonHj = '🌤️'; labelHj = 'Tidak Ada Indikasi Hujan'; warnaHj = 'var(--accent-green)'; }
            boxHj.style.borderLeftColor = warnaHj;
            txtHj.innerHTML =
                '<b>' + ikonHj + ' ' + labelHj + '</b>' +
                '<br><small style="opacity:.75;">Skor: ' + skor + '/100 | Prob jam depan: ' + prob2 + '% | Precip: ' + precipNext.toFixed(1) + ' mm/jam</small>';
        }

        // ── radar satelit ─────────────────────────────────────────────────
        var radarEl = document.getElementById('radarMap');
        if (radarEl) radarEl.src = 'https://mamank757.github.io/peta?lat=' + koordinat.lat + '&lon=' + koordinat.lon;

        return { cur: cur, dp: dp, cape: cape, idx: idx };
    }

    // =========================================================================
    //  RENDER RISIKO LINGKUNGAN
    // =========================================================================

    function hapusBoxRisiko() {
        document.querySelectorAll('.lc-risiko-box').forEach(function (el) { el.remove(); });
        document.querySelectorAll('#weatherData .info-box-dynamic').forEach(function (el) { el.remove(); });
        var bb = document.getElementById('boxBlastRisk');
        if (bb) bb.style.display = 'none';
        var lokal = document.getElementById('localSstBox');
        if (lokal) lokal.style.display = 'none';
    }

    function renderBannerTunggu() {
        hapusBoxRisiko();
        var wd = document.getElementById('weatherData');
        if (!wd) return;
        wd.insertAdjacentHTML('beforeend',
            '<div class="info-box lc-risiko-box" style="border-left-color:#3b82f6;background:rgba(59,130,246,.05);' +
            'margin-top:16px;text-align:center;animation:lcFadeUp .5s ease;">' +
            '<div style="font-size:2rem;margin-bottom:10px;">🛰️</div>' +
            '<div style="font-size:.9rem;font-weight:700;color:#3b82f6;margin-bottom:8px;">Analisis Risiko Hama & Penyakit</div>' +
            '<div style="font-size:.8rem;color:#64748b;line-height:1.8;margin-bottom:14px;">' +
            'Tekan <b style="color:#3b82f6;">TINGKATKAN AKURASI GPS</b> atau <b style="color:#22d3ee;">LOKASI MANUAL</b> di atas untuk melihat:<br>' +
            '<span style="color:#ef4444;">⚠️ Blast Padi &nbsp;•&nbsp; Hawar Pelepah</span><br>' +
            '<span style="color:#f59e0b;">🐛 Penggerek Batang &nbsp;•&nbsp; 🪳 Wereng Coklat</span><br>' +
            '<span style="color:#10b981;">🌾 Tungro &nbsp;•&nbsp; 🐀 Tikus Sawah</span><br>' +
            '<span style="color:#d946ef;">🌱 Fase Tanaman &nbsp;•&nbsp; 📈 Iklim ENSO/IOD</span>' +
            '</div>' +
            '</div>');
    }

    function renderRisiko(cur, dp) {
        hapusBoxRisiko();

        var wd = document.getElementById('weatherData');
        if (!wd) return;

        var bb = document.getElementById('boxBlastRisk');
        if (bb) {
            bb.style.display = 'block';
            if (typeof window.analyzeDiseaseRisk === 'function') window.analyzeDiseaseRisk(cur, dp);
        }

        // ── pastikan nilai input ter-restore ──
        restoreInput();

        var fase = typeof window.analisisFaseTanaman === 'function'
            ? window.analisisFaseTanaman()
            : { fase: '⚠️ Set tanggal tanam', umurHari: 0, musim: '-' };

        function boks(judul, r) {
            return '<div class="info-box lc-risiko-box" style="border-left-color:' + r.warna + ';margin-top:14px;animation:lcFadeUp .4s ease;">' +
                '<strong>' + judul + '</strong><br>' +
                '<div style="font-size:1.1rem;font-weight:800;color:' + r.warna + ';">' + r.level + '</div>' +
                '<p style="margin:5px 0;opacity:.9;">' + r.detail + '</p>' +
                '<div style="background:rgba(255,255,255,.02);padding:8px;border-radius:6px;font-size:.82rem;"><b>💡</b> ' + r.saran + '</div>' +
                '</div>';
        }

        wd.insertAdjacentHTML('beforeend',
            '<div class="info-box lc-risiko-box" style="border-left-color:var(--accent-bwd);margin-top:14px;animation:lcFadeUp .4s ease;">' +
            '<strong>🌱 Fase Tanaman Saat Ini</strong><br>' +
            '<div style="font-size:1rem;font-weight:700;color:var(--accent-bwd);">' + fase.fase + '</div>' +
            '<small>' + fase.musim + ' • ± ' + fase.umurHari + ' hari</small>' +
            '</div>');

        if (typeof window.hitungRisikoTikus        === 'function') wd.insertAdjacentHTML('beforeend', boks('🐀 Tikus Sawah',                   window.hitungRisikoTikus(cur.rain||0, fase)));
        if (typeof window.hitungRisikoHamaPBP      === 'function') wd.insertAdjacentHTML('beforeend', boks('🐛 Penggerek Batang Padi',          window.hitungRisikoHamaPBP(cur.temperature_2m, cur.relative_humidity_2m, fase)));
        if (typeof window.hitungRisikoSheathBlight === 'function') wd.insertAdjacentHTML('beforeend', boks('🍂 Hawar Pelepah (Sheath Blight)',   window.hitungRisikoSheathBlight(cur.temperature_2m, cur.relative_humidity_2m, fase)));
        if (typeof window.hitungRisikoWereng       === 'function') wd.insertAdjacentHTML('beforeend', boks('🪳 Wereng Batang Coklat',            window.hitungRisikoWereng(cur.temperature_2m, cur.relative_humidity_2m, cur.rain||0, fase)));
        if (typeof window.hitungRisikoTungro       === 'function') wd.insertAdjacentHTML('beforeend', boks('🌾 Tungro (Virus)',                  window.hitungRisikoTungro(cur.temperature_2m, cur.relative_humidity_2m, cur.rain||0, fase)));

        var lokal = document.getElementById('localSstBox');
        if (lokal) lokal.style.display = 'block';
        if (typeof window.loadGlobalClimateIndices === 'function') window.loadGlobalClimateIndices();
    }

    // =========================================================================
    //  FUNGSI UTAMA: MUAT CUACA
    // =========================================================================

    async function muatCuaca(koordinat, tampilkanRisiko) {
        if (S.sedangMemuat) return;
        S.sedangMemuat = true;

        var gpsPrompt   = document.getElementById('gpsPrompt');
        var weatherData = document.getElementById('weatherData');
        var result      = document.getElementById('result');
        var resLabel    = document.getElementById('resLabel');
        var resConf     = document.getElementById('resConf');

        if (resLabel) resLabel.style.display = 'none';
        if (resConf)  resConf.style.display  = 'none';
        if (gpsPrompt)   gpsPrompt.style.display   = 'block';
        if (weatherData) weatherData.style.display = 'block';
        if (result)      result.style.display      = 'block';

        simpanInput();
        renderPanelGPS(koordinat);
        renderSkeleton();

        try {
            var data = await fetchCuaca(koordinat.lat, koordinat.lon);
            S.forecast = data.forecast;
            S.archive  = data.archive;

            var rendered = renderCuaca(data.forecast, data.archive, koordinat);

            if (tampilkanRisiko) {
                restoreInput();
                renderRisiko(rendered.cur, rendered.dp);
            } else {
                renderBannerTunggu();
            }

        } catch (err) {
            console.error('[lc] Gagal fetch cuaca:', err.message);
            var namaEl   = document.getElementById('lcNamaLokasi');
            var statusEl = document.getElementById('lcStatusLokasi');
            if (namaEl)   namaEl.textContent = '⚠️ Gagal memuat cuaca';
            if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + (err.message || 'Periksa koneksi') + '</span>';
        } finally {
            S.sedangMemuat = false;
        }
    }

    // =========================================================================
    //  DAPATKAN LOKASI VIA BTS / IP
    // =========================================================================

    async function dapatkanLokasiBTS() {
        if (window._koordinatTerakhir) {
            var p = window._koordinatTerakhir;
            return { lat: p.coords.latitude, lon: p.coords.longitude, label: 'Lokasi Sebelumnya', akurasi: 'gps' };
        }
        // coba GPS non-akurat (cepat, ~3 detik)
        try {
            var pos = await new Promise(function (res, rej) {
                navigator.geolocation.getCurrentPosition(res, rej,
                    { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
            });
            return {
                lat: pos.coords.latitude, lon: pos.coords.longitude,
                label: 'Estimasi Lokasi (Jaringan)',
                akurasi: pos.coords.accuracy <= 200 ? 'gps' : 'bts'
            };
        } catch (e) {}
        // fallback IP
        var srcs = [
            async function () {
                var d = await fetchRetry('https://ipapi.co/json/', 1, 0);
                if (d.latitude) return { lat: +d.latitude, lon: +d.longitude, label: (d.city||'') + ', ' + (d.region||'Indonesia'), akurasi: 'ip' };
            },
            async function () {
                var d = await fetchRetry('https://ip-api.com/json/?fields=lat,lon,city,regionName', 1, 0);
                if (d.lat) return { lat: +d.lat, lon: +d.lon, label: (d.city||'') + ', ' + (d.regionName||'Indonesia'), akurasi: 'ip' };
            }
        ];
        for (var i = 0; i < srcs.length; i++) {
            try { var h = await srcs[i](); if (h) return h; } catch (e) {}
        }
        return Object.assign({}, FALLBACK_LOK);
    }

    // =========================================================================
    //  OVERRIDE switchMode
    // =========================================================================

    var _switchModeAsli = window.switchMode;

    window.switchMode = function (mode) {
        if (mode !== 'cuaca') {
            var rL = document.getElementById('resLabel');
            var rC = document.getElementById('resConf');
            if (rL) rL.style.display = '';
            if (rC) rC.style.display = '';
        }

        _switchModeAsli(mode);

        if (mode === 'cuaca') {
            setTimeout(async function () {
                if (S.gpsAktif && S.koordinat) {
                    S.sedangMemuat = false;
                    await muatCuaca(S.koordinat, true);
                    return;
                }
                if (S.btsDicoba && S.koordinat) {
                    S.sedangMemuat = false;
                    await muatCuaca(S.koordinat, false);
                    return;
                }
                // auto-detect pertama kali
                S.btsDicoba = true;
                try {
                    var lok = await dapatkanLokasiBTS();
                    if (lok.akurasi !== 'fallback') {
                        try { var nm = await reverseGeocode(lok.lat, lok.lon); if (nm) lok.label = nm; } catch(e) {}
                    }
                    // Jika GPS langsung akurat, tandai dan render risiko
                    if (lok.akurasi === 'gps') {
                        S.gpsAktif = true;
                        window._koordinatTerakhir = { coords: { latitude: lok.lat, longitude: lok.lon, accuracy: 10 } };
                    }
                    S.koordinat = lok;
                    S.sedangMemuat = false;
                    await muatCuaca(lok, lok.akurasi === 'gps');
                } catch (err) {
                    S.koordinat = Object.assign({}, FALLBACK_LOK);
                    S.sedangMemuat = false;
                    await muatCuaca(S.koordinat, false);
                }
            }, 80);
        }
    };

    // =========================================================================
    //  EKSPOR: loadWeather & aktifkanGPS (backward compat)
    // =========================================================================

    window.loadWeather = async function () {
        var lok = S.koordinat || FALLBACK_LOK;
        S.sedangMemuat = false;
        await muatCuaca(lok, S.gpsAktif || lok.akurasi === 'gps');
    };

    window.aktifkanGPS = async function () {
        await window.lcSinkronGPS();
    };

    window.sinkronGPSCuaca = window.lcSinkronGPS;

    // =========================================================================
    //  dapatkanLokasiOtomatis — dipakai patch_risiko_iklim
    // =========================================================================

    window.dapatkanLokasiOtomatis = function () {
        return new Promise(async function (resolve, reject) {
            if (window._koordinatTerakhir) {
                var p = window._koordinatTerakhir;
                return resolve({ lat: p.coords.latitude, lon: p.coords.longitude });
            }
            if (S.koordinat) return resolve({ lat: S.koordinat.lat, lon: S.koordinat.lon });
            try {
                var lok = await dapatkanLokasiBTS();
                S.koordinat = lok;
                resolve({ lat: lok.lat, lon: lok.lon });
            } catch (e) { reject(e.message || 'Lokasi tidak tersedia'); }
        });
    };

    // =========================================================================
    //  AUTO-PREFETCH (background, saat halaman dimuat)
    // =========================================================================

    setTimeout(async function () {
        if (S.btsDicoba) return;
        S.btsDicoba = true;
        try {
            var lok = await dapatkanLokasiBTS();
            if (lok.akurasi !== 'fallback') {
                try { var nm = await reverseGeocode(lok.lat, lok.lon); if (nm) lok.label = nm; } catch(e) {}
            }
            if (lok.akurasi === 'gps') {
                S.gpsAktif = true;
                window._koordinatTerakhir = { coords: { latitude: lok.lat, longitude: lok.lon, accuracy: 10 } };
            }
            S.koordinat = lok;
            // jika tab cuaca sudah aktif saat load
            var boxCuaca = document.getElementById('boxCuaca');
            if (boxCuaca && boxCuaca.style.display !== 'none') {
                S.sedangMemuat = false;
                await muatCuaca(lok, lok.akurasi === 'gps');
            }
        } catch(e) { S.koordinat = Object.assign({}, FALLBACK_LOK); }
    }, 200);

    console.log('%c✅ patch_lokasi_cuaca_terpadu v3.0 aktif', 'color:#10b981;font-weight:bold;');
    console.log('   Auto-detect BTS ✓ | GPS Akurat ✓ | Lokasi Manual Peta ✓ | Risiko Lingkungan ✓');

})();
