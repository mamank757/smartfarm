/**
 * ============================================================
 *  PATCH: patch_peta_koordinat.js
 *  Fitur: Geser Titik Koordinat di Peta (Drag Marker)
 *         + Cari Lokasi by Nama (Geocoding Nominatim)
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 2.0
 * ------------------------------------------------------------
 *  Perubahan v2.0:
 *  - Tambah kotak pencarian nama wilayah (kota/kecamatan/desa)
 *  - Pencarian via Nominatim geocoding (OpenStreetMap)
 *  - Hasil pencarian muncul sebagai dropdown, klik untuk pindah marker
 *  - Koordinat bertahan (tidak kembali ke GPS HP) via override
 *    getCurrentPosition sementara saat loadWeather() dipanggil
 * ============================================================
 */

(function () {
    'use strict';

    var TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    var TILE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    var petaModal = {
        instance: null,
        marker:   null,
        tileOSM:  null,
        tileSAT:  null,
        aktif:    false
    };

    // =========================================================================
    //  CSS
    // =========================================================================

    var style = document.createElement('style');
    style.textContent = `
        #modalPetaKoordinat {
            display: none;
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(4, 8, 20, 0.88);
            backdrop-filter: blur(8px);
            z-index: 99998;
            align-items: flex-end;
            justify-content: center;
        }
        #modalPetaKoordinat.aktif { display: flex; }

        #panelPetaKoordinat {
            background: #0f1e35;
            border-radius: 24px 24px 0 0;
            width: 100%; max-width: 520px;
            padding: 0 0 20px 0;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.6);
            animation: slideUpPeta 0.3s ease;
            overflow: hidden;
        }
        @keyframes slideUpPeta {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }

        /* ── Header ── */
        #headerPetaKoordinat {
            display: flex; justify-content: space-between; align-items: center;
            padding: 16px 18px 12px 18px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        #headerPetaKoordinat h3 { margin: 0; font-size: 0.95rem; font-weight: 700; color: #fff; }
        #headerPetaKoordinat small { display: block; font-size: 0.7rem; color: #64748b; margin-top: 3px; font-weight: 500; }
        #btnTutupPetaKoordinat {
            background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
            color: #ef4444; padding: 6px 14px; border-radius: 8px;
            font-size: 0.78rem; font-weight: 700; cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }

        /* ── Kotak Pencarian Nama ── */
        #boxCariLokasi {
            padding: 12px 18px 10px 18px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            position: relative;
        }
        #wrapCariLokasi {
            display: flex; gap: 8px; align-items: center;
        }
        #inputCariLokasi {
            flex: 1;
            background: #111c2e;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 10px 14px;
            color: #fff;
            font-size: 0.82rem;
            font-family: 'Plus Jakarta Sans', sans-serif;
            outline: none;
            transition: border-color 0.2s;
        }
        #inputCariLokasi:focus { border-color: #22d3ee; }
        #inputCariLokasi::placeholder { color: #64748b; }
        #btnCariLokasi {
            background: #22d3ee; color: #0f172a;
            border: none; border-radius: 10px;
            padding: 10px 16px;
            font-size: 0.82rem; font-weight: 700; cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            white-space: nowrap;
            transition: opacity 0.2s;
            flex-shrink: 0;
        }
        #btnCariLokasi:active { opacity: 0.8; }
        #btnCariLokasi:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Dropdown Hasil Pencarian ── */
        #dropdownCariLokasi {
            display: none;
            position: absolute;
            left: 18px; right: 18px;
            top: calc(100% - 2px);
            background: #0f1e35;
            border: 1px solid rgba(34,211,238,0.3);
            border-radius: 12px;
            z-index: 10000;
            max-height: 220px;
            overflow-y: auto;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        #dropdownCariLokasi.tampil { display: block; }
        .item-lokasi {
            padding: 11px 16px;
            font-size: 0.8rem;
            color: #cbd5e1;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            line-height: 1.4;
            transition: background 0.15s;
        }
        .item-lokasi:last-child { border-bottom: none; }
        .item-lokasi:hover, .item-lokasi:active { background: rgba(34,211,238,0.1); color: #fff; }
        .item-lokasi b { color: #22d3ee; font-weight: 700; }
        .item-lokasi small { display: block; font-size: 0.72rem; color: #64748b; margin-top: 2px; }
        #pesanCariLokasi {
            padding: 14px 16px;
            font-size: 0.8rem;
            color: #64748b;
            text-align: center;
        }

        /* ── Kontainer Peta ── */
        #containerPetaKoordinat { width: 100%; height: 300px; position: relative; }
        #leafletPetaKoordinat { width: 100%; height: 100%; }
        #toggleLayerPeta {
            position: absolute; top: 10px; right: 10px; z-index: 1000;
            background: rgba(11,21,40,0.85);
            border: 1px solid rgba(255,255,255,0.12);
            color: #fff; padding: 6px 12px; border-radius: 8px;
            font-size: 0.72rem; font-weight: 700; cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            backdrop-filter: blur(4px);
        }
        #hintGeserMarker {
            position: absolute; bottom: 10px; left: 50%;
            transform: translateX(-50%); z-index: 1000;
            background: rgba(11,21,40,0.85); color: #94a3b8;
            font-size: 0.68rem; font-weight: 600;
            padding: 5px 12px; border-radius: 8px;
            pointer-events: none; backdrop-filter: blur(4px); white-space: nowrap;
        }

        /* ── Info Koordinat ── */
        #infoKoordinatPeta {
            padding: 10px 18px;
            font-size: 0.8rem; color: #94a3b8;
            line-height: 1.6; min-height: 44px;
        }
        #infoKoordinatPeta b { color: #22d3ee; }
        #namaLokasiPeta { color: #fff; font-weight: 600; font-size: 0.85rem; }

        /* ── Tombol Gunakan Lokasi ── */
        #btnGunakanLokasi {
            display: block;
            width: calc(100% - 36px); margin: 4px 18px 0 18px;
            padding: 14px;
            background: linear-gradient(135deg, #22d3ee, #0891b2);
            color: #0f172a; border: none; border-radius: 14px;
            font-weight: 800; font-size: 0.88rem; cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            letter-spacing: 0.3px; transition: all 0.2s ease;
        }
        #btnGunakanLokasi:active { transform: scale(0.98); opacity: 0.9; }
        #btnGunakanLokasi:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Tombol Buka Peta (di gpsPrompt) ── */
        #btnBukaPetaKoordinat {
            width: 100%; padding: 11px 14px;
            background: rgba(34,211,238,0.1);
            border: 1px solid rgba(34,211,238,0.3);
            color: #22d3ee; border-radius: 12px;
            font-weight: 700; font-size: 0.82rem; cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            letter-spacing: 0.3px; margin-top: 8px;
            display: flex; align-items: center; justify-content: center;
            gap: 7px; transition: all 0.2s ease;
        }
        #btnBukaPetaKoordinat:active { background: rgba(34,211,238,0.2); transform: scale(0.98); }

        /* ── Light mode ── */
        body.light-mode #panelPetaKoordinat { background: #ffffff; }
        body.light-mode #headerPetaKoordinat { border-bottom-color: #e2e8f0; }
        body.light-mode #headerPetaKoordinat h3 { color: #0f172a; }
        body.light-mode #boxCariLokasi { border-bottom-color: #e2e8f0; }
        body.light-mode #inputCariLokasi { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
        body.light-mode #inputCariLokasi::placeholder { color: #94a3b8; }
        body.light-mode #dropdownCariLokasi { background: #ffffff; border-color: #0891b2; }
        body.light-mode .item-lokasi { color: #334155; border-bottom-color: #e2e8f0; }
        body.light-mode .item-lokasi:hover { background: rgba(8,145,178,0.08); color: #0f172a; }
        body.light-mode #infoKoordinatPeta { color: #475569; }
        body.light-mode #namaLokasiPeta { color: #0f172a; }
        body.light-mode #toggleLayerPeta { background: rgba(255,255,255,0.9); border-color: #cbd5e1; color: #0f172a; }
        body.light-mode #btnBukaPetaKoordinat { background: rgba(8,145,178,0.08); border-color: rgba(8,145,178,0.3); color: #0891b2; }
        body.light-mode #pesanCariLokasi { color: #94a3b8; }
    `;
    document.head.appendChild(style);

    // =========================================================================
    //  BUAT ELEMEN MODAL
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
                        <small>Ketik nama wilayah atau seret penanda merah</small>
                    </div>
                    <button id="btnTutupPetaKoordinat" onclick="window.tutupPetaKoordinat()">✕ TUTUP</button>
                </div>

                <div id="boxCariLokasi">
                    <div id="wrapCariLokasi">
                        <input
                            id="inputCariLokasi"
                            type="text"
                            placeholder="Cari desa, kecamatan, kota..."
                            autocomplete="off"
                            autocorrect="off"
                            spellcheck="false"
                        />
                        <button id="btnCariLokasi" onclick="window.cariLokasiPeta()">🔍 Cari</button>
                    </div>
                    <div id="dropdownCariLokasi"></div>
                </div>

                <div id="containerPetaKoordinat">
                    <div id="leafletPetaKoordinat"></div>
                    <button id="toggleLayerPeta" onclick="window.toggleLayerPetaKoordinat()">🛰️ Satelit</button>
                    <div id="hintGeserMarker">✋ Seret penanda merah atau klik peta untuk pindah</div>
                </div>

                <div id="infoKoordinatPeta">
                    <div id="namaLokasiPeta">Memuat nama lokasi...</div>
                    <div id="koordinatTeksPeta">—</div>
                </div>

                <button id="btnGunakanLokasi" onclick="window.gunakanLokasiPeta()">
                    ✅ GUNAKAN LOKASI INI
                </button>

            </div>`;

        modal.addEventListener('click', function (e) {
            if (e.target === modal) window.tutupPetaKoordinat();
        });
        document.body.appendChild(modal);

        // Enter di input langsung cari
        var inputEl = document.getElementById('inputCariLokasi');
        if (inputEl) {
            inputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') window.cariLokasiPeta();
            });
            // Tutup dropdown saat klik di luar
            document.addEventListener('click', function (e) {
                var dropdown = document.getElementById('dropdownCariLokasi');
                var box = document.getElementById('boxCariLokasi');
                if (dropdown && box && !box.contains(e.target)) {
                    dropdown.classList.remove('tampil');
                }
            });
        }
    }

    // =========================================================================
    //  GEOCODING — CARI LOKASI BERDASARKAN NAMA
    // =========================================================================

    var _cariTimer = null;

    window.cariLokasiPeta = async function () {
        var input = document.getElementById('inputCariLokasi');
        var dropdown = document.getElementById('dropdownCariLokasi');
        var btnCari = document.getElementById('btnCariLokasi');
        if (!input || !dropdown) return;

        var query = input.value.trim();
        if (!query) return;

        // Loading state
        btnCari.disabled = true;
        btnCari.textContent = '⏳';
        dropdown.innerHTML = '<div id="pesanCariLokasi">Mencari lokasi...</div>';
        dropdown.classList.add('tampil');

        try {
            var url =
                'https://nominatim.openstreetmap.org/search' +
                '?format=jsonv2' +
                '&q=' + encodeURIComponent(query) +
                '&limit=6' +
                '&addressdetails=1' +
                '&countrycodes=id';   // Batasi ke Indonesia saja

            var res = await fetch(url, {
                headers: { 'User-Agent': 'SmartFarming-PPLWajo/2.0' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var hasil = await res.json();

            if (!hasil || hasil.length === 0) {
                dropdown.innerHTML = '<div id="pesanCariLokasi">Lokasi tidak ditemukan. Coba nama lain.</div>';
                return;
            }

            // Render daftar hasil
            dropdown.innerHTML = '';
            hasil.forEach(function (item) {
                var lat = parseFloat(item.lat);
                var lon = parseFloat(item.lon);
                var addr = item.address || {};

                // Susun nama tampilan: nama utama + konteks wilayah
                var namaTampil = item.display_name.split(',')[0].trim();
                var konteks = [
                    addr.village || addr.suburb || addr.hamlet || '',
                    addr.county  || addr.city   || addr.municipality || '',
                    addr.state   || ''
                ].filter(Boolean).join(', ');

                // Jika namaTampil sama dengan konteks pertama, hapus duplikat
                if (konteks.startsWith(namaTampil)) konteks = konteks.substring(namaTampil.length).replace(/^,\s*/, '');

                var el = document.createElement('div');
                el.className = 'item-lokasi';
                el.innerHTML =
                    '<b>' + _escapeHtml(namaTampil) + '</b>' +
                    (konteks ? '<small>' + _escapeHtml(konteks) + '</small>' : '');

                el.addEventListener('click', function () {
                    // Pindahkan marker ke lokasi yang dipilih
                    _pindahMarker(lat, lon);
                    input.value = namaTampil;
                    dropdown.classList.remove('tampil');
                });
                dropdown.appendChild(el);
            });

        } catch (e) {
            dropdown.innerHTML = '<div id="pesanCariLokasi">Gagal mencari. Periksa koneksi internet.</div>';
        } finally {
            btnCari.disabled = false;
            btnCari.textContent = '🔍 Cari';
        }
    };

    function _escapeHtml(teks) {
        return teks
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Pindah marker + fly peta ke koordinat baru
    function _pindahMarker(lat, lon) {
        if (!petaModal.instance || !petaModal.marker) return;
        var latlng = L.latLng(lat, lon);
        petaModal.marker.setLatLng(latlng);
        petaModal.instance.flyTo(latlng, 15, { duration: 1.2 });
        updateInfoKoordinat(lat, lon);
    }

    // =========================================================================
    //  INISIALISASI LEAFLET
    // =========================================================================

    function inisialisasiPetaModal(lat, lon) {
        if (petaModal.instance) {
            petaModal.instance.remove();
            petaModal.instance = null;
            petaModal.marker   = null;
        }

        var peta = L.map('leafletPetaKoordinat', {
            center: [lat, lon], zoom: 15,
            zoomControl: true, attributionControl: false
        });

        petaModal.tileOSM = L.tileLayer(TILE_OSM, { maxZoom: 22, maxNativeZoom: 19 }).addTo(peta);
        petaModal.tileSAT = L.tileLayer(TILE_SAT, { maxZoom: 22, maxNativeZoom: 21, opacity: 0.95 });

        var ikonMarker = L.divIcon({
            className: '',
            html: '<div style="width:28px;height:28px;background:#ef4444;border:3px solid #ffffff;' +
                  'border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
                  'box-shadow:0 4px 12px rgba(239,68,68,0.6);cursor:grab;"></div>',
            iconSize: [28, 28], iconAnchor: [14, 28]
        });

        var marker = L.marker([lat, lon], { icon: ikonMarker, draggable: true, autoPan: true }).addTo(peta);
        marker.bindTooltip('Seret ke lokasi sawah', { permanent: false, direction: 'top', offset: [0, -30] });

        marker.on('dragend', function (e) {
            var pos = e.target.getLatLng();
            updateInfoKoordinat(pos.lat, pos.lng);
        });

        peta.on('click', function (e) {
            marker.setLatLng(e.latlng);
            updateInfoKoordinat(e.latlng.lat, e.latlng.lng);
        });

        petaModal.instance = peta;
        petaModal.marker   = marker;
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
            koordinatEl.innerHTML = '<b>' + lat.toFixed(6) + '°, ' + lon.toFixed(6) + '°</b>';
        }
        if (namaEl) namaEl.textContent = 'Mencari nama lokasi...';

        clearTimeout(_geocodeTimer);
        _geocodeTimer = setTimeout(async function () {
            try {
                var res = await fetch(
                    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon,
                    { headers: { 'User-Agent': 'SmartFarming-PPLWajo/2.0' } }
                );
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var data = await res.json();
                var a = data.address || {};
                var desa = a.village || a.suburb || a.hamlet || a.town || a.city || 'Lokasi';
                var kab  = a.county  || a.city   || a.municipality || '';
                var prov = a.state   || '';
                if (namaEl) {
                    namaEl.textContent = desa + (kab ? ', ' + kab : '') + (prov ? ', ' + prov : '');
                }
            } catch (e) {
                if (namaEl) namaEl.textContent = lat.toFixed(5) + ', ' + lon.toFixed(5);
            }
        }, 300);
    }

    // =========================================================================
    //  TOGGLE LAYER SATELIT / OSM
    // =========================================================================

    var _modeSatelit = false;

    window.toggleLayerPetaKoordinat = function () {
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

    window.bukaPetaKoordinat = function () {
        buatModalPeta();
        var modal = document.getElementById('modalPetaKoordinat');
        if (!modal) return;
        modal.classList.add('aktif');
        petaModal.aktif = true;

        // Bersihkan input pencarian
        var inputEl = document.getElementById('inputCariLokasi');
        if (inputEl) inputEl.value = '';
        var dropdown = document.getElementById('dropdownCariLokasi');
        if (dropdown) dropdown.classList.remove('tampil');

        var lat = -4.0, lon = 120.0;

        // Prioritas 1: koordinat yang sudah pernah dipilih dari peta
        if (window._koordinatDariPeta) {
            lat = window._koordinatDariPeta.lat;
            lon = window._koordinatDariPeta.lon;
        }
        // Prioritas 2: koordinat GPS terakhir dari sinkronisasi cuaca
        else if (window._koordinatTerakhir) {
            lat = window._koordinatTerakhir.coords.latitude;
            lon = window._koordinatTerakhir.coords.longitude;
        }
        // Prioritas 3: baca dari teks UI
        else {
            var lokasiEl = document.getElementById('lokasiSawah');
            if (lokasiEl && lokasiEl.innerText && lokasiEl.innerText !== '-') {
                var parts = lokasiEl.innerText.split(',');
                if (parts.length === 2) {
                    var parsedLat = parseFloat(parts[0].trim());
                    var parsedLon = parseFloat(parts[1].trim());
                    if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
                        lat = parsedLat; lon = parsedLon;
                    }
                }
            }
        }

        setTimeout(function () {
            inisialisasiPetaModal(lat, lon);
            if (petaModal.instance) petaModal.instance.invalidateSize();
        }, 120);
    };

    // =========================================================================
    //  TUTUP MODAL PETA
    // =========================================================================

    window.tutupPetaKoordinat = function () {
        var modal = document.getElementById('modalPetaKoordinat');
        if (modal) modal.classList.remove('aktif');
        petaModal.aktif = false;
        _modeSatelit = false;
        var btn = document.getElementById('toggleLayerPeta');
        if (btn) btn.textContent = '🛰️ Satelit';
        var dropdown = document.getElementById('dropdownCariLokasi');
        if (dropdown) dropdown.classList.remove('tampil');
    };

    // =========================================================================
    //  GUNAKAN LOKASI DARI PETA
    //  FIX: Override getCurrentPosition sementara agar koordinat tidak
    //       kembali ke GPS HP saat loadWeather() dipanggil.
    // =========================================================================

    window.gunakanLokasiPeta = async function () {
        if (!petaModal.marker) return;

        var btn = document.getElementById('btnGunakanLokasi');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Memperbarui data cuaca...'; }

        var pos = petaModal.marker.getLatLng();
        var lat = pos.lat;
        var lon = pos.lng;

        var namaEl = document.getElementById('namaLokasiPeta');
        var label  = namaEl ? namaEl.textContent : (lat.toFixed(5) + ', ' + lon.toFixed(5));

        // Simpan agar sesi berikutnya modal buka di posisi yang sama
        window._koordinatDariPeta = { lat: lat, lon: lon, label: label };

        // ── Override getCurrentPosition SEMENTARA ──────────────────────────
        // Mencegah loadWeather() meminta GPS HP baru.
        // Fungsi asli dikembalikan di blok finally setelah loadWeather selesai.
        var _geolocationAsli = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = function (sukses) {
            sukses({
                coords: { latitude: lat, longitude: lon, accuracy: 0 },
                timestamp: Date.now()
            });
        };

        // Update window._koordinatTerakhir untuk kompatibilitas patch lain
        window._koordinatTerakhir = {
            coords: { latitude: lat, longitude: lon, accuracy: 0 }
        };

        // Tutup modal lebih dulu agar UX terasa responsif
        window.tutupPetaKoordinat();

        // Update label UI langsung tanpa menunggu cuaca
        _updateLabelUI(lat, lon, label);

        try {
            if (typeof window.loadWeather === 'function') {
                await window.loadWeather();
            } else if (typeof window.sinkronGPSCuaca === 'function') {
                await window.sinkronGPSCuaca();
            }
        } catch (e) {
            console.warn('[patch_peta] Gagal load cuaca:', e);
        } finally {
            // ── Kembalikan getCurrentPosition ke fungsi asli browser ──────
            navigator.geolocation.getCurrentPosition = _geolocationAsli;
        }

        if (btn) { btn.disabled = false; btn.textContent = '✅ GUNAKAN LOKASI INI'; }
    };

    // =========================================================================
    //  HELPER: Update label UI cuaca
    // =========================================================================

    function _updateLabelUI(lat, lon, label) {
        var namaLokasiEl = document.getElementById('namaLokasiCuacaUI');
        var statusEl     = document.getElementById('statusLokasiCuacaUI');
        var lokasiSawah  = document.getElementById('lokasiSawah');
        var alamatDesa   = document.getElementById('alamatDesa');

        if (namaLokasiEl) namaLokasiEl.textContent = label;
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#22d3ee;">📍 Lokasi dipilih manual dari peta</span>';
        }
        if (lokasiSawah) {
            lokasiSawah.innerText = lat.toFixed(5) + ', ' + lon.toFixed(5);
        }
        if (alamatDesa) {
            alamatDesa.innerHTML =
                '<b>' + label + '</b>' +
                '<span style="display:inline-block;margin-left:8px;font-size:0.7rem;' +
                'padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.08);' +
                'color:#22d3ee;">📍 Dipilih dari Peta</span>';
        }
        window._lokasiKalender = { lat: lat, lon: lon };
    }

    // =========================================================================
    //  INJECT TOMBOL KE gpsPrompt
    // =========================================================================

    function injekTombolPeta() {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) return false;
        if (document.getElementById('btnBukaPetaKoordinat')) return true;
        var btnGPS = document.getElementById('btnGPSSinkron');
        if (!btnGPS) return false;
        var tombol = document.createElement('button');
        tombol.id        = 'btnBukaPetaKoordinat';
        tombol.innerHTML = '📍 ATUR LOKASI MANUAL DI PETA';
        tombol.onclick   = function () { window.bukaPetaKoordinat(); };
        btnGPS.insertAdjacentElement('afterend', tombol);
        return true;
    }

    // =========================================================================
    //  MUTATION OBSERVER
    // =========================================================================

    var _observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            if (m.type === 'childList' || m.type === 'subtree') injekTombolPeta();
        });
    });

    function mulaiObservasi() {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (gpsPrompt) {
            _observer.observe(gpsPrompt, { childList: true, subtree: true });
            injekTombolPeta();
        } else {
            setTimeout(mulaiObservasi, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mulaiObservasi);
    } else {
        mulaiObservasi();
    }

    // =========================================================================
    //  TOMBOL BACK ANDROID & SWIPE KE BAWAH
    // =========================================================================

    window.addEventListener('popstate', function () {
        if (petaModal.aktif) window.tutupPetaKoordinat();
    });

    var _swipeStartY = 0;
    document.addEventListener('touchstart', function (e) {
        if (!petaModal.aktif) return;
        _swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
        if (!petaModal.aktif) return;
        if (e.changedTouches[0].clientY - _swipeStartY > 80) window.tutupPetaKoordinat();
    }, { passive: true });

    console.log('%c📍 patch_peta_koordinat.js v2.0 aktif — Search Lokasi + Koordinat Bertahan', 'color:#22d3ee; font-weight:bold;');

})();
