/**
 * ============================================================
 *  PATCH: Input Lokasi Manual / Koordinat di Menu Risiko Cuaca
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.0
 * ============================================================
 *
 *  MASALAH:
 *  patch_cuaca_langsung.js menimpa #gpsPrompt secara total lewat
 *  renderUITombolGPS(), menghilangkan opsi atur lokasi manual.
 *
 *  SOLUSI:
 *  Setelah renderUITombolGPS() selesai, patch ini menyisipkan
 *  tombol "📍 Atur Lokasi Manual" di bawah tombol GPS utama.
 *  Tombol itu membuka panel input:
 *    1. Koordinat Lat/Lon manual (ketik angka)
 *    2. Nama kota / wilayah (cari via Nominatim → ambil koordinat)
 *    3. Tarik dari peta mini Leaflet (klik titik di peta)
 *
 *  CARA PASANG:
 *  Tambahkan di HTML setelah patch_cuaca_langsung.js:
 *
 *    <script src="patch_lokasi_manual.js"></script>
 *
 *  Urutan: patch_cuaca_langsung.js → patch_lokasi_manual.js
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  STATE
    // =========================================================================

    var state = {
        panelTerbuka: false,
        mapInstance: null,
        markerInstance: null
    };

    // =========================================================================
    //  CSS
    // =========================================================================

    var style = document.createElement('style');
    style.textContent = [
        '#panelLokasiManual {',
        '  display:none;',
        '  margin-top:10px;',
        '  background:rgba(59,130,246,0.06);',
        '  border:1px solid rgba(59,130,246,0.2);',
        '  border-radius:14px;',
        '  padding:14px;',
        '  animation:fadeInManual 0.3s ease;',
        '}',
        '@keyframes fadeInManual {',
        '  from{opacity:0;transform:translateY(-6px);}',
        '  to{opacity:1;transform:translateY(0);}',
        '}',
        '#panelLokasiManual .m-label {',
        '  display:block;',
        '  font-size:0.68rem;',
        '  font-weight:700;',
        '  color:#64748b;',
        '  letter-spacing:0.5px;',
        '  margin-bottom:5px;',
        '}',
        '#panelLokasiManual input[type=text],',
        '#panelLokasiManual input[type=number] {',
        '  width:100%;',
        '  box-sizing:border-box;',
        '  background:#111c2e;',
        '  border:1px solid rgba(255,255,255,0.06);',
        '  border-radius:10px;',
        '  padding:10px 12px;',
        '  color:#fff;',
        '  font-size:0.82rem;',
        '  font-family:inherit;',
        '  margin-bottom:10px;',
        '}',
        'body.light-mode #panelLokasiManual input[type=text],',
        'body.light-mode #panelLokasiManual input[type=number] {',
        '  background:#f8fafc;',
        '  color:#0f172a;',
        '  border-color:#94a3b8;',
        '}',
        '#mapLokasiManual {',
        '  height:200px;',
        '  border-radius:10px;',
        '  overflow:hidden;',
        '  margin-bottom:10px;',
        '  border:1px solid rgba(255,255,255,0.08);',
        '}',
        '#btnAturLokasiManual {',
        '  width:100%;',
        '  padding:11px;',
        '  margin-top:6px;',
        '  background:rgba(59,130,246,0.1);',
        '  color:#3b82f6;',
        '  border:1px solid rgba(59,130,246,0.35);',
        '  border-radius:10px;',
        '  font-size:0.8rem;',
        '  font-weight:700;',
        '  cursor:pointer;',
        '  font-family:inherit;',
        '  letter-spacing:0.3px;',
        '  transition:all 0.2s;',
        '  display:flex;',
        '  align-items:center;',
        '  justify-content:center;',
        '  gap:6px;',
        '}',
        '#btnAturLokasiManual:active {',
        '  transform:scale(0.98);opacity:0.85;',
        '}',
        'body.light-mode #btnAturLokasiManual {',
        '  background:rgba(59,130,246,0.08);',
        '  color:#1d4ed8;',
        '  border-color:rgba(59,130,246,0.4);',
        '}'
    ].join('');
    document.head.appendChild(style);

    // =========================================================================
    //  UTILITAS
    // =========================================================================

    /**
     * Geocode nama kota → koordinat via Nominatim OpenStreetMap.
     */
    async function geocodeNama(namaWilayah) {
        var url = 'https://nominatim.openstreetmap.org/search' +
            '?format=jsonv2&limit=1&q=' + encodeURIComponent(namaWilayah) +
            '&countrycodes=id';
        var res = await fetch(url, {
            headers: { 'User-Agent': 'SmartFarming-PPLWajo/1.0 (lokasi-manual)' }
        });
        if (!res.ok) throw new Error('Nominatim HTTP ' + res.status);
        var data = await res.json();
        if (!data || data.length === 0) throw new Error('Lokasi "' + namaWilayah + '" tidak ditemukan.');
        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            label: data[0].display_name || namaWilayah
        };
    }

    /**
     * Reverse geocode koordinat → nama tempat via Nominatim.
     */
    async function reverseGeocode(lat, lon) {
        try {
            var res = await fetch(
                'https://nominatim.openstreetmap.org/reverse' +
                '?format=jsonv2&lat=' + lat + '&lon=' + lon,
                { headers: { 'User-Agent': 'SmartFarming-PPLWajo/1.0' } }
            );
            if (!res.ok) return null;
            var d = await res.json();
            var a = d.address || {};
            var desa = a.village || a.suburb || a.hamlet || a.town || 'Lokasi';
            var kab  = a.county  || a.city   || a.municipality || '';
            return desa + (kab ? ', Kab. ' + kab : '');
        } catch (e) {
            return null;
        }
    }

    /**
     * Panggil sinkronGPSCuaca milik patch_cuaca_langsung dengan koordinat paksa.
     * Cara: set window._koordinatTerakhir agar sinkronGPSCuaca membacanya,
     * kemudian panggil muatCuaca langsung (akses internal lewat window.sinkronGPSCuaca
     * tidak bisa dipaksa koordinat, jadi kita trigger loadWeather asli).
     */
    async function terapkanLokasiManual(lat, lon, label) {
        // Simpan ke variabel global yang dipakai patch_cuaca_langsung
        window._koordinatTerakhir = {
            coords: { latitude: lat, longitude: lon, accuracy: 999 }
        };

        // Perbarui UI lokasi di #gpsPrompt jika sudah ada
        var namaEl   = document.getElementById('namaLokasiCuacaUI');
        var statusEl = document.getElementById('statusLokasiCuacaUI');
        if (namaEl)   namaEl.textContent = label;
        if (statusEl) statusEl.innerHTML =
            '<span style="color:#f59e0b;">📍 Lokasi Manual — Tekan Tombol GPS untuk analisis risiko aktif</span>';

        // Perbarui elemen lokasiSawah & alamatDesa (yang ditampilkan di weatherData)
        var lokasiEl = document.getElementById('lokasiSawah');
        var alamatEl = document.getElementById('alamatDesa');
        if (lokasiEl) lokasiEl.innerText = lat.toFixed(5) + ', ' + lon.toFixed(5);
        if (alamatEl) alamatEl.innerHTML = '<b>' + label + '</b>' +
            '<span style="display:inline-block;margin-left:8px;font-size:0.7rem;' +
            'padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.08);' +
            'color:#f59e0b;">📍 Manual</span>';

        // Perbarui src radar peta satelit
        var radarEl = document.getElementById('radarMap');
        if (radarEl) radarEl.src = 'https://mamank757.github.io/peta?lat=' + lat + '&lon=' + lon;

        // Tutup panel
        tutupPanel();

        // Tampilkan konfirmasi di notifikasi app (jika ada)
        if (typeof window.tampilkanPesan === 'function') {
            window.tampilkanPesan(
                '📍 Lokasi manual ditetapkan:\n' + label +
                '\n\nTekan tombol GPS/Satelit di atas untuk memuat cuaca & analisis risiko di lokasi ini.',
                'info'
            );
        }

        // Langsung muat data cuaca lewat loadWeather jika tersedia
        // (loadWeather asli dari HTML index membaca koordinat GPS via getCurrentPosition;
        //  kita bypass dengan menyimpan ke window._koordinatTerakhir yang sudah dicek di loadWeather)
        if (typeof window.loadWeather === 'function') {
            try {
                await window.loadWeather();
            } catch (e) {
                console.warn('[patch_lokasi_manual] loadWeather gagal, coba sinkronGPSCuaca:', e.message);
            }
        }
    }

    // =========================================================================
    //  INISIALISASI PETA MINI LEAFLET
    // =========================================================================

    function inisialisasiPetaMini(lat, lon) {
        // Cegah init ulang
        if (state.mapInstance) {
            state.mapInstance.setView([lat, lon], 13);
            if (state.markerInstance) state.markerInstance.setLatLng([lat, lon]);
            return;
        }

        // Leaflet harus sudah dimuat (dari HTML utama)
        if (typeof L === 'undefined') {
            document.getElementById('mapLokasiManual').innerHTML =
                '<div style="padding:20px;text-align:center;color:#64748b;font-size:0.8rem;">' +
                '⚠️ Peta tidak tersedia (Leaflet belum dimuat)</div>';
            return;
        }

        var map = L.map('mapLokasiManual', {
            zoomControl: true,
            attributionControl: false
        }).setView([lat, lon], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Marker awal
        var marker = L.marker([lat, lon], { draggable: true }).addTo(map);
        marker.bindPopup('Geser marker ke lokasi sawah').openPopup();

        // Update koordinat saat marker digeser
        marker.on('dragend', async function () {
            var ll = marker.getLatLng();
            document.getElementById('inputLatManual').value = ll.lat.toFixed(6);
            document.getElementById('inputLonManual').value = ll.lng.toFixed(6);
            // Reverse geocode
            var nama = await reverseGeocode(ll.lat, ll.lng);
            if (nama) document.getElementById('inputNamaWilayahManual').value = nama;
        });

        // Klik peta untuk pindah marker
        map.on('click', async function (e) {
            marker.setLatLng(e.latlng);
            document.getElementById('inputLatManual').value = e.latlng.lat.toFixed(6);
            document.getElementById('inputLonManual').value = e.latlng.lng.toFixed(6);
            var nama = await reverseGeocode(e.latlng.lat, e.latlng.lng);
            if (nama) document.getElementById('inputNamaWilayahManual').value = nama;
        });

        state.mapInstance  = map;
        state.markerInstance = marker;

        // Invalidate setelah panel terlihat agar peta render benar
        setTimeout(function () { map.invalidateSize(); }, 200);
    }

    // =========================================================================
    //  BUKA / TUTUP PANEL
    // =========================================================================

    function bukaPanel() {
        var panel = document.getElementById('panelLokasiManual');
        if (!panel) return;
        state.panelTerbuka = true;
        panel.style.display = 'block';

        // Tentukan koordinat awal peta (gunakan yang sudah ada atau default Wajo)
        var latAwal = -4.0;
        var lonAwal = 120.03;
        var cached  = window._koordinatTerakhir;
        if (cached && cached.coords) {
            latAwal = cached.coords.latitude;
            lonAwal = cached.coords.longitude;
        }

        // Isi input lat/lon dari koordinat saat ini
        var inLat = document.getElementById('inputLatManual');
        var inLon = document.getElementById('inputLonManual');
        if (inLat && !inLat.value) inLat.value = latAwal.toFixed(6);
        if (inLon && !inLon.value) inLon.value = lonAwal.toFixed(6);

        // Inisialisasi peta mini
        setTimeout(function () {
            inisialisasiPetaMini(latAwal, lonAwal);
        }, 100);

        // Ganti teks tombol toggle
        var btn = document.getElementById('btnAturLokasiManual');
        if (btn) btn.innerHTML = '<span>✕</span><span>TUTUP PANEL LOKASI MANUAL</span>';
    }

    function tutupPanel() {
        var panel = document.getElementById('panelLokasiManual');
        if (!panel) return;
        state.panelTerbuka = false;
        panel.style.display = 'none';

        var btn = document.getElementById('btnAturLokasiManual');
        if (btn) btn.innerHTML = '<span>📍</span><span>ATUR LOKASI MANUAL / PETA</span>';
    }

    window._togglePanelLokasiManual = function () {
        if (state.panelTerbuka) tutupPanel(); else bukaPanel();
    };

    // =========================================================================
    //  AKSI TOMBOL DI PANEL
    // =========================================================================

    /** Terapkan dari input Lat/Lon langsung */
    window._terapkanKoordinatManual = async function () {
        var lat = parseFloat(document.getElementById('inputLatManual').value);
        var lon = parseFloat(document.getElementById('inputLonManual').value);

        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            alert('⚠️ Koordinat tidak valid.\nPastikan Latitude antara -90 s.d 90 dan Longitude antara -180 s.d 180.');
            return;
        }

        var btn = document.getElementById('btnTerapkanKoordinat');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }

        try {
            var label = await reverseGeocode(lat, lon);
            if (!label) label = lat.toFixed(5) + ', ' + lon.toFixed(5);
            await terapkanLokasiManual(lat, lon, label);
        } catch (e) {
            alert('Gagal: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✅ Terapkan Koordinat Ini'; }
        }
    };

    /** Terapkan dari pencarian nama wilayah */
    window._cariDanTerapkanWilayah = async function () {
        var nama = (document.getElementById('inputNamaWilayahManual').value || '').trim();
        if (!nama) { alert('⚠️ Masukkan nama kota / kecamatan / desa terlebih dahulu.'); return; }

        var btn = document.getElementById('btnCariWilayahManual');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Mencari...'; }

        try {
            var hasil = await geocodeNama(nama);
            // Perbarui input koordinat & peta
            document.getElementById('inputLatManual').value = hasil.lat.toFixed(6);
            document.getElementById('inputLonManual').value = hasil.lon.toFixed(6);

            if (state.mapInstance) {
                state.mapInstance.setView([hasil.lat, hasil.lon], 14);
                if (state.markerInstance) state.markerInstance.setLatLng([hasil.lat, hasil.lon]);
            }

            // Langsung terapkan
            await terapkanLokasiManual(hasil.lat, hasil.lon, hasil.label.split(',').slice(0,2).join(','));
        } catch (e) {
            alert('Gagal: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔍 Cari & Terapkan'; }
        }
    };

    // =========================================================================
    //  RENDER HTML PANEL
    // =========================================================================

    function buatHTMLPanel() {
        return [
            '<div id="panelLokasiManual">',

            // ── Seksi 1: Cari nama wilayah ──────────────────────────────────
            '<div style="margin-bottom:14px;">',
            '<span class="m-label">🔍 CARI NAMA KOTA / KECAMATAN / DESA</span>',
            '<div style="display:flex;gap:8px;">',
            '<input type="text" id="inputNamaWilayahManual" placeholder="Contoh: Tempe, Wajo, Sulawesi Selatan" style="flex:1;margin-bottom:0;">',
            '<button id="btnCariWilayahManual" onclick="window._cariDanTerapkanWilayah()"',
            ' style="flex-shrink:0;padding:10px 14px;background:linear-gradient(135deg,#3b82f6,#2563eb);',
            'color:#fff;border:none;border-radius:10px;font-weight:700;font-size:0.78rem;',
            'cursor:pointer;font-family:inherit;white-space:nowrap;">🔍 Cari & Terapkan</button>',
            '</div>',
            '</div>',

            '<div style="text-align:center;font-size:0.72rem;color:#475569;margin:8px 0 12px;',
            'border-top:1px dashed rgba(255,255,255,0.07);padding-top:10px;">— atau —</div>',

            // ── Seksi 2: Koordinat Manual ────────────────────────────────────
            '<span class="m-label">📐 INPUT KOORDINAT LANGSUNG (DARI GOOGLE MAPS DLL.)</span>',
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">',
            '<div>',
            '<span class="m-label">Latitude (°)</span>',
            '<input type="number" id="inputLatManual" step="0.000001" placeholder="-4.000000">',
            '</div>',
            '<div>',
            '<span class="m-label">Longitude (°)</span>',
            '<input type="number" id="inputLonManual" step="0.000001" placeholder="120.000000">',
            '</div>',
            '</div>',
            '<button id="btnTerapkanKoordinat" onclick="window._terapkanKoordinatManual()"',
            ' style="width:100%;padding:11px;background:linear-gradient(135deg,#10b981,#059669);',
            'color:#fff;border:none;border-radius:10px;font-weight:700;font-size:0.82rem;',
            'cursor:pointer;font-family:inherit;margin-bottom:12px;">',
            '✅ Terapkan Koordinat Ini</button>',

            '<div style="text-align:center;font-size:0.72rem;color:#475569;margin:0 0 10px;',
            'border-top:1px dashed rgba(255,255,255,0.07);padding-top:10px;">— atau klik/geser peta —</div>',

            // ── Seksi 3: Peta Mini ───────────────────────────────────────────
            '<span class="m-label">🗺️ KLIK / GESER MARKER DI PETA</span>',
            '<div id="mapLokasiManual"></div>',
            '<div style="font-size:0.7rem;color:#475569;margin-top:-6px;margin-bottom:10px;line-height:1.5;">',
            'Klik titik sawah di peta atau geser marker ke posisi yang tepat, lalu tekan tombol koordinat di atas.',
            '</div>',

            // ── Cara mendapatkan koordinat ───────────────────────────────────
            '<div style="background:rgba(0,0,0,0.15);border-radius:10px;padding:10px 12px;',
            'font-size:0.7rem;color:#64748b;line-height:1.7;">',
            '💡 <b style="color:#94a3b8;">Cara ambil koordinat dari Google Maps:</b><br>',
            '① Buka Google Maps → cari lokasi sawah<br>',
            '② Tekan & tahan titik lokasi (long press)<br>',
            '③ Angka lat,lon muncul di bagian bawah layar<br>',
            '④ Salin & tempelkan ke kolom di atas',
            '</div>',

            '</div>'  // tutup #panelLokasiManual
        ].join('');
    }

    // =========================================================================
    //  SISIPKAN TOMBOL & PANEL KE #gpsPrompt
    // =========================================================================

    /**
     * Tunggu sampai renderUITombolGPS() selesai menyisipkan tombol GPS,
     * lalu tambahkan tombol "Atur Lokasi Manual" dan panel di bawahnya.
     */
    function sisipkanKeTombolGPS() {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) {
            setTimeout(sisipkanKeTombolGPS, 300);
            return;
        }

        // Cegah double-insert
        if (document.getElementById('btnAturLokasiManual')) return;

        // Buat tombol toggle
        var tombol = document.createElement('button');
        tombol.id  = 'btnAturLokasiManual';
        tombol.innerHTML = '<span>📍</span><span>ATUR LOKASI MANUAL / PETA</span>';
        tombol.addEventListener('click', window._togglePanelLokasiManual);

        // Buat kontainer panel
        var panelWrapper = document.createElement('div');
        panelWrapper.innerHTML = buatHTMLPanel();

        // Sisipkan setelah elemen terakhir di gpsPrompt
        gpsPrompt.appendChild(tombol);
        gpsPrompt.appendChild(panelWrapper.firstChild);

        console.log('[patch_lokasi_manual] Tombol & panel lokasi manual berhasil disisipkan.');
    }

    // =========================================================================
    //  OBSERVER: Deteksi saat #gpsPrompt diperbarui oleh patch_cuaca_langsung
    //  (karena renderUITombolGPS() mengganti innerHTML, kita perlu re-sisipkan)
    // =========================================================================

    var _observerAktif = false;

    function pasangObserver() {
        var gpsPrompt = document.getElementById('gpsPrompt');
        if (!gpsPrompt) {
            setTimeout(pasangObserver, 500);
            return;
        }

        if (_observerAktif) return;
        _observerAktif = true;

        var obs = new MutationObserver(function () {
            // Setiap kali #gpsPrompt diubah (render ulang oleh patch_cuaca),
            // cek apakah tombol manual kita masih ada. Jika tidak, sisipkan ulang.
            if (!document.getElementById('btnAturLokasiManual')) {
                // Reset state peta agar inisialisasi ulang saat dibuka lagi
                state.mapInstance    = null;
                state.markerInstance = null;
                state.panelTerbuka   = false;

                // Tunda sedikit agar innerHTML selesai dirender
                setTimeout(sisipkanKeTombolGPS, 150);
            }
        });

        obs.observe(gpsPrompt, { childList: true, subtree: true });
    }

    // =========================================================================
    //  INIT
    // =========================================================================

    // Mulai observer segera
    pasangObserver();

    // Coba sisip pertama kali setelah DOM siap
    setTimeout(sisipkanKeTombolGPS, 500);

    console.log('✅ [patch_lokasi_manual v1.0] Terpasang — Lokasi Manual / Peta aktif di menu Risiko Cuaca.');

})();
