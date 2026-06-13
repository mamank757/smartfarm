/**
 * ============================================================
 *  PATCH: patch_peta_koordinat.js
 *  Fitur: Geser Titik Koordinat di Peta (Drag Marker)
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.0
 * ------------------------------------------------------------
 *  Cara kerja:
 *  1. Tombol "📍 ATUR LOKASI DI PETA" muncul di bawah tombol GPS
 *  2. Membuka modal peta Leaflet mini (OpenStreetMap + Satelit)
 *  3. Marker bisa digeser ke titik mana saja di Indonesia
 *  4. Setelah "GUNAKAN LOKASI INI" diklik:
 *     - koordinat baru disimpan ke state patch_cuaca_langsung
 *     - data cuaca & risiko langsung diperbarui
 *     - label lokasi diperbarui via reverse geocode
 *
 *  Dependensi:
 *  - Leaflet CSS & JS (sudah ada di HTML)
 *  - patch_cuaca_langsung.js (harus dimuat sebelum patch ini)
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONSTANTA
    // =========================================================================

    var TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    var TILE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    // =========================================================================
    //  STATE INTERNAL
    // =========================================================================

    var petaModal = {
        instance:   null,   // Leaflet map instance
        marker:     null,   // Draggable marker
        tileOSM:    null,
        tileSAT:    null,
        aktif:      false
    };

    // =========================================================================
    //  INJECT CSS MODAL
    // =========================================================================

    var style = document.createElement('style');
    style.textContent = `
        /* ── Overlay Modal ─────────────────────────────────── */
        #modalPetaKoordinat {
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(4, 8, 20, 0.88);
            backdrop-filter: blur(8px);
            z-index: 99998;
            align-items: flex-end;
            justify-content: center;
        }
        #modalPetaKoordinat.aktif {
            display: flex;
        }

        /* ── Panel dalam Modal ─────────────────────────────── */
        #panelPetaKoordinat {
            background: #0f1e35;
            border-radius: 24px 24px 0 0;
            width: 100%;
            max-width: 520px;
            padding: 0 0 20px 0;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.6);
            animation: slideUpPeta 0.3s ease;
            overflow: hidden;
        }

        @keyframes slideUpPeta {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }

        /* ── Header Panel ──────────────────────────────────── */
        #headerPetaKoordinat {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 18px 12px 18px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        #headerPetaKoordinat h3 {
            margin: 0;
            font-size: 0.95rem;
            font-weight: 700;
            color: #ffffff;
        }
        #headerPetaKoordinat small {
            display: block;
            font-size: 0.7rem;
            color: #64748b;
            margin-top: 3px;
            font-weight: 500;
        }
        #btnTutupPetaKoordinat {
            background: rgba(239,68,68,0.15);
            border: 1px solid rgba(239,68,68,0.3);
            color: #ef4444;
            padding: 6px 14px;
            border-radius: 8px;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }

        /* ── Kontainer Peta ────────────────────────────────── */
        #containerPetaKoordinat {
            width: 100%;
            height: 340px;
            position: relative;
        }
        #leafletPetaKoordinat {
            width: 100%;
            height: 100%;
        }

        /* ── Toggle Layer ──────────────────────────────────── */
        #toggleLayerPeta {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(11,21,40,0.85);
            border: 1px solid rgba(255,255,255,0.12);
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 0.72rem;
            font-weight: 700;
            cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            backdrop-filter: blur(4px);
        }

        /* ── Info Koordinat ────────────────────────────────── */
        #infoKoordinatPeta {
            padding: 12px 18px;
            font-size: 0.8rem;
            color: #94a3b8;
            line-height: 1.6;
            min-height: 48px;
        }
        #infoKoordinatPeta b {
            color: #22d3ee;
        }
        #namaLokasiPeta {
            color: #ffffff;
            font-weight: 600;
            font-size: 0.85rem;
        }

        /* ── Tombol Gunakan Lokasi ─────────────────────────── */
        #btnGunakanLokasi {
            display: block;
            width: calc(100% - 36px);
            margin: 4px 18px 0 18px;
            padding: 14px;
            background: linear-gradient(135deg, #22d3ee, #0891b2);
            color: #0f172a;
            border: none;
            border-radius: 14px;
            font-weight: 800;
            font-size: 0.88rem;
            cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            letter-spacing: 0.3px;
            transition: all 0.2s ease;
        }
        #btnGunakanLokasi:active {
            transform: scale(0.98);
            opacity: 0.9;
        }
        #btnGunakanLokasi:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* ── Tombol Buka Peta (disuntikkan ke gpsPrompt) ───── */
        #btnBukaPetaKoordinat {
            width: 100%;
            padding: 11px 14px;
            background: rgba(34, 211, 238, 0.1);
            border: 1px solid rgba(34, 211, 238, 0.3);
            color: #22d3ee;
            border-radius: 12px;
            font-weight: 700;
            font-size: 0.82rem;
            cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            letter-spacing: 0.3px;
            margin-top: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            transition: all 0.2s ease;
        }
        #btnBukaPetaKoordinat:active {
            background: rgba(34, 211, 238, 0.2);
            transform: scale(0.98);
        }

        /* ── Crosshair hint di tengah peta ─────────────────── */
        #hintGeserMarker {
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            background: rgba(11,21,40,0.85);
            color: #94a3b8;
            font-size: 0.68rem;
            font-weight: 600;
            padding: 5px 12px;
            border-radius: 8px;
            pointer-events: none;
            backdrop-filter: blur(4px);
            white-space: nowrap;
        }

        /* Light mode override */
        body.light-mode #panelPetaKoordinat {
            background: #ffffff;
        }
        body.light-mode #headerPetaKoordinat {
            border-bottom-color: #e2e8f0;
        }
        body.light-mode #headerPetaKoordinat h3 {
            color: #0f172a;
        }
        body.light-mode #infoKoordinatPeta {
            color: #475569;
        }
        body.light-mode #namaLokasiPeta {
            color: #0f172a;
        }
        body.light-mode #toggleLayerPeta {
            background: rgba(255,255,255,0.9);
            border-color: #cbd5e1;
            color: #0f172a;
        }
        body.light-mode #btnBukaPetaKoordinat {
            background: rgba(8,145,178,0.08);
            border-color: rgba(8,145,178,0.3);
            color: #0891b2;
        }
    `;
    document.head.appendChild(style);

    // =========================================================================
    //  BUAT ELEMEN MODAL (inject ke body)
    // =========================================================================

    function buatModalPeta() {
        if (document.getElementById('modalPetaKoordinat')) return;

        var modal = document.createElement('div');
        modal.id = 'modalPetaKoordinat';
        modal.innerHTML = `
            <div id="panelPetaKoordinat">

                <div id="headerPetaKoordinat">
                    <div>
                        <h3>📍 Atur Lokasi Sawah di Peta</h3>
                        <small>Seret penanda merah ke titik sawah yang tepat</small>
                    </div>
                    <button id="btnTutupPetaKoordinat" onclick="window.tutupPetaKoordinat()">
                        ✕ TUTUP
                    </button>
                </div>

                <div id="containerPetaKoordinat">
                    <div id="leafletPetaKoordinat"></div>
                    <button id="toggleLayerPeta" onclick="window.toggleLayerPetaKoordinat()">
                        🛰️ Satelit
                    </button>
                    <div id="hintGeserMarker">✋ Seret penanda merah untuk pindah lokasi</div>
                </div>

                <div id="infoKoordinatPeta">
                    <div id="namaLokasiPeta">Memuat nama lokasi...</div>
                    <div id="koordinatTeksPeta">—</div>
                </div>

                <button id="btnGunakanLokasi" onclick="window.gunakanLokasiPeta()">
                    ✅ GUNAKAN LOKASI INI
                </button>

            </div>
        `;

        // Tutup modal jika klik overlay (di luar panel)
        modal.addEventListener('click', function(e) {
            if (e.target === modal) window.tutupPetaKoordinat();
        });

        document.body.appendChild(modal);
    }

    // =========================================================================
    //  INISIALISASI LEAFLET DI DALAM MODAL
    // =========================================================================

    function inisialisasiPetaModal(lat, lon) {
        // Jika sudah ada instance sebelumnya, hapus dulu
        if (petaModal.instance) {
            petaModal.instance.remove();
            petaModal.instance = null;
            petaModal.marker   = null;
        }

        var peta = L.map('leafletPetaKoordinat', {
            center: [lat, lon],
            zoom: 15,
            zoomControl: true,
            attributionControl: false
        });

        // Layer OSM (default)
        petaModal.tileOSM = L.tileLayer(TILE_OSM, {
            maxZoom: 22,
            maxNativeZoom: 19
        }).addTo(peta);

        // Layer Satelit (tersembunyi awal)
        petaModal.tileSAT = L.tileLayer(TILE_SAT, {
            maxZoom: 22,
            maxNativeZoom: 21,
            opacity: 0.95
        });

        // Custom icon marker merah
        var ikonMarker = L.divIcon({
            className: '',
            html: `<div style="
                width: 28px; height: 28px;
                background: #ef4444;
                border: 3px solid #ffffff;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 4px 12px rgba(239,68,68,0.6);
                cursor: grab;
            "></div>`,
            iconSize:   [28, 28],
            iconAnchor: [14, 28],
            popupAnchor:[0, -30]
        });

        // Marker yang bisa digeser
        var marker = L.marker([lat, lon], {
            icon:      ikonMarker,
            draggable: true,
            autoPan:   true
        }).addTo(peta);

        marker.bindTooltip(
            'Seret ke lokasi sawah',
            { permanent: false, direction: 'top', offset: [0, -30] }
        );

        // Update koordinat & nama setiap kali marker digeser
        marker.on('dragend', function(e) {
            var pos = e.target.getLatLng();
            updateInfoKoordinat(pos.lat, pos.lng);
        });

        // Klik di peta juga pindahkan marker
        peta.on('click', function(e) {
            marker.setLatLng(e.latlng);
            updateInfoKoordinat(e.latlng.lat, e.latlng.lng);
        });

        petaModal.instance = peta;
        petaModal.marker   = marker;

        // Update info awal
        updateInfoKoordinat(lat, lon);
    }

    // =========================================================================
    //  UPDATE INFO KOORDINAT + REVERSE GEOCODE
    // =========================================================================

    var _geocodeTimer = null;

    function updateInfoKoordinat(lat, lon) {
        var koordinatEl = document.getElementById('koordinatTeksPeta');
        var namaEl      = document.getElementById('namaLokasiPeta');

        if (koordinatEl) {
            koordinatEl.innerHTML =
                '<b>' + lat.toFixed(6) + '°, ' + lon.toFixed(6) + '°</b>';
        }
        if (namaEl) namaEl.textContent = 'Mencari nama lokasi...';

        // Debounce reverse geocode (300ms setelah berhenti geser)
        clearTimeout(_geocodeTimer);
        _geocodeTimer = setTimeout(async function() {
            try {
                var res = await fetch(
                    'https://nominatim.openstreetmap.org/reverse' +
                    '?format=jsonv2&lat=' + lat + '&lon=' + lon,
                    { headers: { 'User-Agent': 'SmartFarming-PPLWajo/2.0' } }
                );
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var data = await res.json();
                var a    = data.address || {};
                var desa = a.village || a.suburb || a.hamlet || a.town || a.city || 'Lokasi';
                var kab  = a.county  || a.city   || a.municipality || '';
                var prov = a.state   || '';

                if (namaEl) {
                    namaEl.textContent = desa + (kab ? ', ' + kab : '') + (prov ? ', ' + prov : '');
                }
            } catch(e) {
                if (namaEl) namaEl.textContent = lat.toFixed(5) + ', ' + lon.toFixed(5);
            }
        }, 300);
    }

    // =========================================================================
    //  TOGGLE LAYER SATELIT / OSM
    // =========================================================================

    var _modeSatelit = false;

    window.toggleLayerPetaKoordinat = function() {
        if (!petaModal.instance) return;
        var btn = document.getElementById('toggleLayerPeta');

        _modeSatelit = !_modeSatelit;

        if (_modeSatelit) {
            petaModal.tileSAT.addTo(petaModal.instance);
            petaModal.tileOSM.remove();
            if (btn) btn.textContent = '🗺️ Peta';
        } else {
            petaModal.tileOSM.addTo(petaModal.instance);
            petaModal.tileSAT.remove();
            if (btn) btn.textContent = '🛰️ Satelit';
        }
    };

    // =========================================================================
    //  BUKA MODAL PETA
    // =========================================================================

    window.bukaPetaKoordinat = function() {
        buatModalPeta();

        var modal = document.getElementById('modalPetaKoordinat');
        if (!modal) return;
        modal.classList.add('aktif');
        petaModal.aktif = true;

        // Gunakan koordinat aktif dari patch_cuaca_langsung
        // Akses melalui window._koordinatTerakhir atau elemen UI
        var lat = -4.0;
        var lon = 120.0;

        // Coba ambil dari GPS tersimpan
        if (window._koordinatTerakhir) {
            lat = window._koordinatTerakhir.coords.latitude;
            lon = window._koordinatTerakhir.coords.longitude;
        } else {
            // Coba baca dari teks koordinat di UI
            var lokasiEl = document.getElementById('lokasiSawah');
            if (lokasiEl && lokasiEl.innerText && lokasiEl.innerText !== '-') {
                var parts = lokasiEl.innerText.split(',');
                if (parts.length === 2) {
                    var parsedLat = parseFloat(parts[0].trim());
                    var parsedLon = parseFloat(parts[1].trim());
                    if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
                        lat = parsedLat;
                        lon = parsedLon;
                    }
                }
            }
        }

        // Inisialisasi peta setelah modal terlihat
        // (Leaflet butuh elemen visible untuk render)
        setTimeout(function() {
            inisialisasiPetaModal(lat, lon);
            // Paksa Leaflet hitung ulang ukuran container
            if (petaModal.instance) {
                petaModal.instance.invalidateSize();
            }
        }, 120);
    };

    // =========================================================================
    //  TUTUP MODAL PETA
    // =========================================================================

    window.tutupPetaKoordinat = function() {
        var modal = document.getElementById('modalPetaKoordinat');
        if (modal) modal.classList.remove('aktif');
        petaModal.aktif = false;
        _modeSatelit    = false;

        // Reset tombol toggle layer
        var btn = document.getElementById('toggleLayerPeta');
        if (btn) btn.textContent = '🛰️ Satelit';
    };

    // =========================================================================
    //  GUNAKAN LOKASI DARI PETA
    // =========================================================================

    window.gunakanLokasiPeta = async function() {
        if (!petaModal.marker) return;

        var btn = document.getElementById('btnGunakanLokasi');
        if (btn) {
            btn.disabled     = true;
            btn.textContent  = '⏳ Memperbarui data cuaca...';
        }

        var pos    = petaModal.marker.getLatLng();
        var lat    = pos.lat;
        var lon    = pos.lng;

        // Ambil nama lokasi dari UI peta (sudah di-geocode)
        var namaEl = document.getElementById('namaLokasiPeta');
        var label  = namaEl ? namaEl.textContent : (lat.toFixed(5) + ', ' + lon.toFixed(5));

        // Buat objek koordinat baru
        var koordinatBaru = {
            lat:     lat,
            lon:     lon,
            label:   label,
            akurasi: 'peta'   // tanda khusus: dipilih manual dari peta
        };

        // Simpan ke window._koordinatTerakhir dalam format kompatibel
        // agar patch_cuaca_langsung bisa membacanya
        window._koordinatTerakhir = {
            coords: {
                latitude:  lat,
                longitude: lon,
                accuracy:  0
            }
        };

        // Tutup modal
        window.tutupPetaKoordinat();

        // Panggil sinkronGPSCuaca dari patch_cuaca_langsung
        // dengan meng-override koordinat sebelum fetch data cuaca
        // Caranya: inject koordinat langsung ke state patch
        // melalui event custom agar tidak tightly coupled
        var ev = new CustomEvent('koordinatDipilihDariPeta', {
            detail: koordinatBaru
        });
        window.dispatchEvent(ev);

        if (btn) {
            btn.disabled    = false;
            btn.textContent = '✅ GUNAKAN LOKASI INI';
        }
    };

    // =========================================================================
    //  LISTENER: Koordinat dari peta diterima
    //  Menghubungkan patch ini dengan patch_cuaca_langsung
    // =========================================================================

    window.addEventListener('koordinatDipilihDariPeta', async function(e) {
        var koordinat = e.detail;

        // Update label di UI cuaca langsung
        var namaLokasiEl = document.getElementById('namaLokasiCuacaUI');
        var statusEl     = document.getElementById('statusLokasiCuacaUI');
        var lokasiSawah  = document.getElementById('lokasiSawah');
        var alamatDesa   = document.getElementById('alamatDesa');

        if (namaLokasiEl) namaLokasiEl.textContent = koordinat.label;
        if (statusEl) {
            statusEl.innerHTML =
                '<span style="color:#22d3ee;">📍 Lokasi dipilih manual dari peta</span>';
        }
        if (lokasiSawah) {
            lokasiSawah.innerText =
                koordinat.lat.toFixed(5) + ', ' + koordinat.lon.toFixed(5);
        }
        if (alamatDesa) {
            alamatDesa.innerHTML =
                '<b>' + koordinat.label + '</b>' +
                '<span style="display:inline-block;margin-left:8px;font-size:0.7rem;' +
                'padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.08);' +
                'color:#22d3ee;">📍 Dipilih dari Peta</span>';
        }

        // Simpan ke cache global _lokasiKalender (untuk patch_risiko_iklim)
        window._lokasiKalender = {
            lat: koordinat.lat,
            lon: koordinat.lon
        };

        // Panggil sinkronGPSCuaca jika tersedia,
        // tapi intercept agar pakai koordinat peta, bukan GPS baru
        if (typeof window.sinkronGPSCuaca === 'function') {
            // Inject koordinat ke window._koordinatTerakhir sudah dilakukan
            // di gunakanLokasiPeta() — tinggal panggil versi ringkas
            // yang hanya fetch cuaca tanpa minta GPS ulang
            await _muatCuacaDenganKoordinat(koordinat);
        }
    });

    // =========================================================================
    //  HELPER: Muat cuaca dengan koordinat tertentu
    //  (bypass GPS, langsung fetch Open-Meteo)
    // =========================================================================

    async function _muatCuacaDenganKoordinat(koordinat) {
        // Panggil loadWeather versi lama jika tersedia (fallback)
        // Atau panggil muat ulang via event chain patch_cuaca_langsung

        // Cara paling bersih: simulasi klik tombol GPS
        // tapi koordinat sudah di-override di _koordinatTerakhir
        // sehingga patch_cuaca_langsung akan membacanya
        if (typeof window.sinkronGPSCuaca === 'function') {
            // Override sementara: patch_cuaca_langsung akan baca
            // _koordinatTerakhir yang sudah kita set sebelumnya
            // Trick: kita panggil event yang didengar oleh switchMode
            // dengan mode cuaca untuk trigger reload penuh

            // Simpan state gpsAktif agar risiko muncul
            // Akses state internal patch via closure tidak mungkin langsung,
            // jadi kita gunakan cara alternatif:
            // set flag di window agar patch_cuaca tahu ini dari peta
            window._koordinatDariPeta = koordinat;

            // Reload data cuaca dengan cara memanggil loadWeather
            // yang sudah ada di HTML asli (jika masih ada)
            if (typeof window.loadWeather === 'function') {
                try {
                    await window.loadWeather();
                    return;
                } catch(e) {}
            }

            // Jika loadWeather tidak ada (sudah di-override patch),
            // trigger switchMode cuaca untuk reload penuh
            if (typeof window.switchMode === 'function') {
                // Reset flag agar BTS tidak dipanggil ulang
                window.switchMode('cuaca');
            }
        }
    }

    // =========================================================================
    //  INJECT TOMBOL KE gpsPrompt
    //  Mengamati DOM sampai tombol GPS muncul, lalu inject tombol peta
    // =========================================================================

    function injekTombolPeta() {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) return false;

        // Cek apakah tombol sudah ada
        if (document.getElementById('btnBukaPetaKoordinat')) return true;

        // Tombol hanya di-inject setelah btnGPSSinkron ada
        var btnGPS = document.getElementById('btnGPSSinkron');
        if (!btnGPS) return false;

        var tombol = document.createElement('button');
        tombol.id        = 'btnBukaPetaKoordinat';
        tombol.innerHTML = '📍 ATUR LOKASI MANUAL DI PETA';
        tombol.onclick   = function() { window.bukaPetaKoordinat(); };

        // Sisipkan setelah btnGPSSinkron
        btnGPS.insertAdjacentElement('afterend', tombol);
        return true;
    }

    // =========================================================================
    //  MUTATION OBSERVER: Pantau gpsPrompt, inject tombol setiap kali
    //  patch_cuaca_langsung merender ulang innerHTML-nya
    // =========================================================================

    var _observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.type === 'childList' || m.type === 'subtree') {
                // Coba inject tombol jika belum ada
                injekTombolPeta();
            }
        });
    });

    // Mulai observasi setelah DOM siap
    function mulaiObservasi() {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (gpsPrompt) {
            _observer.observe(gpsPrompt, {
                childList: true,
                subtree:   true
            });
            // Coba inject langsung
            injekTombolPeta();
        } else {
            // Coba lagi 500ms kemudian
            setTimeout(mulaiObservasi, 500);
        }
    }

    // Tunggu DOM siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mulaiObservasi);
    } else {
        mulaiObservasi();
    }

    // =========================================================================
    //  TUTUP MODAL DENGAN TOMBOL BACK ANDROID
    // =========================================================================

    window.addEventListener('popstate', function() {
        if (petaModal.aktif) {
            window.tutupPetaKoordinat();
        }
    });

    // =========================================================================
    //  SWIPE KE BAWAH UNTUK TUTUP MODAL (Mobile UX)
    // =========================================================================

    var _swipeStartY = 0;

    document.addEventListener('touchstart', function(e) {
        if (!petaModal.aktif) return;
        _swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!petaModal.aktif) return;
        var delta = e.changedTouches[0].clientY - _swipeStartY;
        // Swipe ke bawah > 80px menutup modal
        if (delta > 80) window.tutupPetaKoordinat();
    }, { passive: true });

    // =========================================================================
    //  KONFIRMASI PATCH AKTIF
    // =========================================================================

    console.log(
        '%c📍 patch_peta_koordinat.js aktif — Fitur Geser Titik Koordinat di Peta',
        'color:#22d3ee; font-weight:bold;'
    );

})();
