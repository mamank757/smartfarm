/**
 * ============================================================
 * patch_gelombang_ekuator_v1.js
 * Integrasi Kelvin Wave + Rossby Wave + MJO ke RISIKO CUACA
 * ------------------------------------------------------------
 * CARA PASANG — letakkan PALING TERAKHIR:
 *   <script src="patch_fix_integrasi_6faktor_v1.js"></script>
 *   <script src="patch_kalender_tnm_sst_mjo_v1.js"></script>
 *   <script src="patch_gelombang_ekuator_v1.js"></script>  ← file ini
 *
 * SEBELUM DIPAKAI, ISI URL GAS DI BAWAH:
 *   window.GAS_ENDPOINTS.kelvin  → URL deploy KelvinWave_Proxy_GAS_v2.gs
 *   window.GAS_ENDPOINTS.rossby  → URL deploy RossbyWave_Proxy_GAS_v2.gs
 *   (MJO sudah dari mjo_loader.js yang ada)
 *
 * HIERARKI ILMIAH YANG DITERAPKAN:
 *   MJO (30-90 hari)   → KALENDER TNM + RISIKO CUACA  ✅ sudah ada
 *   Kelvin Wave (3-14 hari) → RISIKO CUACA saja        ← BARU
 *   Rossby Wave (5-10 hari) → RISIKO CUACA saja        ← BARU
 *   Keduanya TIDAK mengubah rekomendasi KALENDER TNM —
 *   timescale-nya terlalu pendek untuk perencanaan bulanan.
 *
 * APA YANG DILAKUKAN:
 *   1. Fetch Kelvin Wave dan Rossby Wave dari GAS endpoints.
 *   2. Simpan ke window.kelvinData dan window.rossbyData.
 *   3. Setelah loadWeather() selesai (tab RISIKO CUACA), sisipkan
 *      kotak peringatan dini gelombang ekuatorial di bawah kotak
 *      Blast yang sudah ada.
 *   4. Integrasi ringan ke hitungRisikoDinamis (RISIKO IKLIM):
 *      Kelvin Wave aktif + lokasi sudah di bujur Indonesia
 *      (>=105°E) → tambahkan faktor konveksi jangka pendek kecil
 *      ke skor, HANYA untuk fase Tanam dan Vegetatif (satu minggu
 *      ke depan masih relevan). Fase Generatif dan Panen tidak
 *      disentuh karena nilainya lebih banyak ditentukan bulan,
 *      bukan minggu.
 *
 * [MERGED v1.1] Menggabungkan guard sawah RAWA (dulu BUG-3 di
 *   patch_bugfix_b1b3_v1.js — file itu sekarang dihapus, BUG-1
 *   miliknya dipindah ke patch_fix_integrasi_6faktor_v1.js).
 *   Sawah RAWA pakai model banjir sendiri (patch_sawah_rawa_v1.js);
 *   delta Kelvin/Rossby di atas TIDAK relevan untuk risiko genangan
 *   rawa, jadi dilewati sepenuhnya untuk mode itu — lihat
 *   getJenisSawahGelombang() di BAGIAN 3.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__gelombangEkuatorV1Aktif) {
        console.warn('[gelombang_ekuator] sudah aktif, skip.');
        return;
    }

    // ── Inisialisasi endpoint (bisa diisi dari HTML sebelum patch ini) ──
    window.GAS_ENDPOINTS = window.GAS_ENDPOINTS || {};
    // Jika GAS_ENDPOINTS.kelvin belum diisi dari HTML, gunakan placeholder
    // yang akan menghasilkan error lebih jelas daripada diam-diam gagal
    var _KELVIN_URL = window.GAS_ENDPOINTS.kelvin || null;
    var _ROSSBY_URL = window.GAS_ENDPOINTS.rossby || null;

    // ── State global gelombang ekuatorial ──
    window.kelvinData = null;
    window.rossbyData = null;

    // ============================================================
    //  BAGIAN 1 — FETCH DATA GELOMBANG
    // ============================================================

    async function fetchKelvinWave() {
        if (!_KELVIN_URL) {
            console.warn('[gelombang_ekuator] GAS_ENDPOINTS.kelvin belum diisi — Kelvin Wave tidak akan ditampilkan.');
            return null;
        }
        try {
            var res = await fetch(_KELVIN_URL);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            if (data.error) throw new Error(data.error);
            window.kelvinData = data;
            console.log('[gelombang_ekuator] Kelvin Wave:', data.label, '| Indeks:', data.indeksKelvin);
            return data;
        } catch (e) {
            console.warn('[gelombang_ekuator] Gagal fetch Kelvin Wave:', e.message);
            return null;
        }
    }

    async function fetchRossbyWave() {
        if (!_ROSSBY_URL) {
            console.warn('[gelombang_ekuator] GAS_ENDPOINTS.rossby belum diisi — Rossby Wave tidak akan ditampilkan.');
            return null;
        }
        try {
            var res = await fetch(_ROSSBY_URL);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            if (data.error) throw new Error(data.error);
            window.rossbyData = data;
            console.log('[gelombang_ekuator] Rossby Wave:', data.label, '| Indeks:', data.indeksRossby);
            return data;
        } catch (e) {
            console.warn('[gelombang_ekuator] Gagal fetch Rossby Wave:', e.message);
            return null;
        }
    }

    // ============================================================
    //  BAGIAN 2 — RENDER KOTAK PERINGATAN DINI DI RISIKO CUACA
    // ============================================================

    function warnaTingkat(aktif, indeks) {
        if (!aktif)       return 'var(--accent-green)';
        if (indeks >= 2)  return 'var(--red-alert)';
        return 'var(--accent-soil)';
    }

    function renderKotakGelombang(kelvin, rossby) {
        var weatherData = document.getElementById('weatherData');
        if (!weatherData) return;

        // Hapus kotak lama jika ada (refresh)
        var lama = document.getElementById('kotakGelombangEkuator');
        if (lama) lama.remove();

        var isiKelvin = '';
        if (kelvin && !kelvin.error) {
            var wK = warnaTingkat(kelvin.aktif, kelvin.indeksKelvin);
            isiKelvin = '<div class="info-box" style="border-left-color:' + wK + '; margin-top:15px;">' +
                '<strong>〰️ Kelvin Wave Ekuatorial</strong><br>' +
                '<div style="font-size:1.05rem;font-weight:800;color:' + wK + ';">' +
                (kelvin.aktif ? 'AKTIF' : 'TIDAK AKTIF') + ' — ' + kelvin.ikonStatus + '</div>' +
                '<div style="font-size:0.8rem;color:#cbd5e1;margin-top:4px;line-height:1.6;">' +
                '📍 Posisi: ' + (kelvin.posisi || '-') +
                ' <span style="opacity:0.6;">(±' + (kelvin.posisiBujur || '-') + '°E)</span><br>' +
                '🧭 ' + (kelvin.arah || '-') + '<br>' +
                '📊 Indeks: ' + kelvin.indeksKelvin + ' | Anomali u850: ' + kelvin.anomaliAngin + ' m/s<br>' +
                '💬 ' + (kelvin.dampak || '-') +
                '</div>' +
                '<div style="font-size:0.7rem;opacity:0.4;margin-top:6px;">' +
                'Sumber: ' + (kelvin._sumber || 'Open-Meteo') + ' • ' + (kelvin.tanggal || '') +
                '</div>' +
                '</div>';
        } else if (!_KELVIN_URL) {
            isiKelvin = '<div class="info-box" style="border-left-color:#334155;margin-top:15px;opacity:0.5;">' +
                '<strong>〰️ Kelvin Wave</strong><br>' +
                '<small>GAS_ENDPOINTS.kelvin belum diisi di HTML. Deploy KelvinWave_Proxy_GAS_v2.gs lalu set window.GAS_ENDPOINTS.kelvin.</small>' +
                '</div>';
        }

        var isiRossby = '';
        if (rossby && !rossby.error) {
            var wR = warnaTingkat(rossby.aktif, rossby.indeksRossby);
            isiRossby = '<div class="info-box" style="border-left-color:' + wR + '; margin-top:10px;">' +
                '<strong>🌊 Rossby Wave Ekuatorial</strong><br>' +
                '<div style="font-size:1.05rem;font-weight:800;color:' + wR + ';">' +
                (rossby.aktif ? 'AKTIF' : 'TIDAK AKTIF') + ' — ' + rossby.ikonStatus + '</div>' +
                '<div style="font-size:0.8rem;color:#cbd5e1;margin-top:4px;line-height:1.6;">' +
                '🧭 ' + (rossby.arah || '-') + '<br>' +
                '📊 Indeks: ' + rossby.indeksRossby +
                ' | Vortisitas: ' + rossby.vortisitas + ' ×10⁻⁵ s⁻¹<br>' +
                '💬 ' + (rossby.dampak || '-') +
                '</div>' +
                '<div style="font-size:0.7rem;opacity:0.4;margin-top:6px;">' +
                'Sumber: ' + (rossby._sumber || 'Open-Meteo') + ' • ' + (rossby.tanggal || '') +
                '</div>' +
                '</div>';
        } else if (!_ROSSBY_URL) {
            isiRossby = '<div class="info-box" style="border-left-color:#334155;margin-top:10px;opacity:0.5;">' +
                '<strong>🌊 Rossby Wave</strong><br>' +
                '<small>GAS_ENDPOINTS.rossby belum diisi di HTML. Deploy RossbyWave_Proxy_GAS_v2.gs lalu set window.GAS_ENDPOINTS.rossby.</small>' +
                '</div>';
        }

        // MJO dari window.mjoData yang sudah ada
        var isiMJO = '';
        var mjo = window.mjoData;
        if (mjo && mjo.fase) {
            var ampMJO = parseFloat(mjo.amplitudo || 0);
            var wM = ampMJO >= 1.5 ? 'var(--accent-kalender)' : 'var(--accent-green)';
            var labelFase = [
                '', 'Fase 1 — Afrika Timur', 'Fase 2 — Samudra Hindia Barat',
                'Fase 3 — Samudra Hindia Timur', 'Fase 4 — Maritime Continent Barat',
                'Fase 5 — Maritime Continent Timur (Sulawesi/Papua)',
                'Fase 6 — Pasifik Barat', 'Fase 7 — Pasifik Tengah',
                'Fase 8 — Pasifik Timur / Afrika'
            ][mjo.fase] || ('Fase ' + mjo.fase);
            var dampakMJO = ampMJO >= 1.5
                ? (mjo.fase >= 4 && mjo.fase <= 6
                    ? '☔ MJO aktif di Maritime Continent — konveksi meningkat Sulawesi/Kalimantan'
                    : mjo.fase >= 1 && mjo.fase <= 3
                        ? '🌦️ MJO menuju Maritime Continent — pantau 2-3 minggu ke depan'
                        : '🌤️ MJO aktif tapi menjauh dari Indonesia')
                : '✅ MJO lemah — tidak ada gangguan intramusiman signifikan';

            isiMJO = '<div class="info-box" style="border-left-color:' + wM + '; margin-top:10px;">' +
                '<strong>🌀 MJO (Madden-Julian Oscillation)</strong><br>' +
                '<div style="font-size:1.05rem;font-weight:800;color:' + wM + ';">' +
                labelFase + '</div>' +
                '<div style="font-size:0.8rem;color:#cbd5e1;margin-top:4px;line-height:1.6;">' +
                '📊 Amplitudo: ' + ampMJO.toFixed(2) + (ampMJO >= 1.0 ? ' (Aktif)' : ' (Lemah)') + '<br>' +
                '💬 ' + dampakMJO +
                '</div>' +
                '<div style="font-size:0.7rem;opacity:0.4;margin-top:6px;">Sumber: BOM RMM (Wheeler & Hendon 2004)</div>' +
                '</div>';
        }

        var wrapper = document.createElement('div');
        wrapper.id = 'kotakGelombangEkuator';
        wrapper.style.cssText = 'margin-top:0;';

        // Ringkasan status singkat untuk ditampilkan di summary accordion
        // (tanpa perlu buka accordion dulu) supaya info penting tetap
        // langsung terlihat sekilas.
        var adaAktif = (kelvin && !kelvin.error && kelvin.aktif) ||
                        (rossby && !rossby.error && rossby.aktif) ||
                        (window.mjoData && window.mjoData.fase && parseFloat(window.mjoData.amplitudo || 0) >= 1.0);
        var hintTeks = adaAktif ? '⚡ Ada gelombang aktif' : '✅ Tidak ada gelombang aktif';

        wrapper.innerHTML =
            '<details class="cuaca-accordion" style="border-left-color:#d946ef;">' +
                '<summary>〰️ Gelombang Ekuatorial & MJO <span class="cuaca-accordion-hint">' + hintTeks + '</span></summary>' +
                '<div class="cuaca-accordion-body">' +
                    '<div style="font-size:0.7rem;color:#64748b;margin-bottom:4px;">' +
                    'Pengaruh jangka pendek (hari–minggu) — lebih pendek dari siklus musiman, relevan untuk RISIKO CUACA saja' +
                    '</div>' +
                    isiMJO + isiKelvin + isiRossby +
                '</div>' +
            '</details>';

        // Sisipkan setelah kotak Blast
        var kotakBlast = document.getElementById('boxBlastRisk');
        if (kotakBlast && kotakBlast.parentNode) {
            kotakBlast.parentNode.insertBefore(wrapper, kotakBlast.nextSibling);
        } else {
            weatherData.appendChild(wrapper);
        }
    }

    // ============================================================
    //  BAGIAN 3 — INTEGRASI RINGAN KE hitungRisikoDinamis
    //  Hanya untuk fase Tanam & Vegetatif, bukan Generatif/Panen
    //  Besaran: maksimal ±8% dari indeksKelvin → tidak mendominasi
    // ============================================================

    // ── [MERGED — eks BUG-3 patch_bugfix_b1b3_v1.js] ──
    // Sama seperti getJenisSawah() di file-file lain: baca dropdown
    // jenis sawah yang sedang aktif (Risiko Iklim / Kalender TNM).
    function getJenisSawahGelombang() {
        var elJTO    = document.getElementById('selectJenisSawahJTO');
        var elRisiko = document.getElementById('selectJenisSawahRisiko');
        return (elJTO && elJTO.value) || (elRisiko && elRisiko.value) || 'irigasi';
    }

    function pasangKelvinKeRisikoDinamis(tick) {
        tick = tick || 0;
        if (typeof window.hitungRisikoDinamis !== 'function') {
            if (tick >= 50) return;
            setTimeout(function () { pasangKelvinKeRisikoDinamis(tick + 1); }, 100);
            return;
        }
        if (window.hitungRisikoDinamis.__kelvinTersuntik) return;

        var asli = window.hitungRisikoDinamis;
        window.hitungRisikoDinamis = function (bulanIndex, fase, ensoVal, iodVal, baselineData) {
            var hasil = asli.apply(this, arguments);

            // [MERGED — eks BUG-3] Sawah RAWA pakai model banjir khusus
            // (patch_sawah_rawa_v1.js) — delta Kelvin/Rossby (konveksi
            // jangka pendek untuk sawah irigasi/tadah hujan) TIDAK relevan
            // secara ilmiah untuk risiko genangan rawa. Lewati sepenuhnya,
            // kembalikan hasil dari lapisan di bawah (skor_6faktor, yang
            // sudah rawa-aware) apa adanya.
            if (getJenisSawahGelombang() === 'rawa') return hasil;

            // Hanya fase Tanam dan Vegetatif yang relevan dengan kejadian minggu ini
            if (fase !== 'Tanam' && fase !== 'Vegetatif') return hasil;

            var kelvin = window.kelvinData;
            var rossby = window.rossbyData;
            if (!kelvin && !rossby) return hasil;

            var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
            var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

            // Kelvin Wave relevan jika sudah di bujur Indonesia (>=105°E)
            var deltaKelvin = 0;
            if (kelvin && !kelvin.error && kelvin.aktif && kelvin.posisiBujur >= 105) {
                // Kelvin Wave aktif di Indonesia = potensi konveksi naik
                // Untuk fase Tanam: banjir/genangan naik sedikit
                // Untuk Vegetatif: hujan ekstra bisa bantu atau genang
                var k = Math.min(kelvin.indeksKelvin, 2.5) / 2.5;
                deltaKelvin = k * 6; // maksimal +6 skor (sekitar +4-8% dari 100)
            }

            // Rossby Wave aktif dan bergerak ke barat
            var deltaRossby = 0;
            if (rossby && !rossby.error && rossby.aktif) {
                var r = Math.min(rossby.indeksRossby, 2.0) / 2.0;
                deltaRossby = r * 4; // lebih kecil dari Kelvin (Rossby lebih lambat/lemah)
            }

            var delta = deltaKelvin + deltaRossby;
            if (Math.abs(delta) < 1) return hasil; // tidak perlu ubah jika tidak signifikan

            // Terapkan ke skor
            hasil.skor = Math.round(Math.max(0, Math.min(100, hasil.skor + delta)));

            // Tambahkan keterangan ke masalah
            var infoGelombang = [];
            if (deltaKelvin > 0) {
                infoGelombang.push('Kelvin Wave aktif di ' + (kelvin.posisi || '-') +
                    ' (Δ+' + deltaKelvin.toFixed(0) + ')');
            }
            if (deltaRossby > 0) {
                infoGelombang.push('Rossby Wave aktif (Δ+' + deltaRossby.toFixed(0) + ')');
            }
            if (infoGelombang.length > 0) {
                hasil.masalah = hasil.masalah + ' [〰️ ' + infoGelombang.join(' · ') + ']';
            }

            return hasil;
        };
        window.hitungRisikoDinamis.__kelvinTersuntik = true;
        console.log('%c✅ [gelombang_ekuator] Kelvin+Rossby tersuntik ke hitungRisikoDinamis (fase Tanam & Vegetatif saja)', 'color:#d946ef;font-weight:bold;');
    }

    // ============================================================
    //  BAGIAN 4 — HOOK KE loadWeather()
    // ============================================================

    function hookLoadWeather(tick) {
        tick = tick || 0;
        if (typeof window.loadWeather !== 'function') {
            if (tick >= 50) {
                console.warn('[gelombang_ekuator] window.loadWeather tidak ditemukan — kotak gelombang tidak akan otomatis muncul di tab Cuaca. Coba panggil window.tampilkanGelombangEkuator() secara manual setelah GPS tersinkron.');
                return;
            }
            setTimeout(function () { hookLoadWeather(tick + 1); }, 100);
            return;
        }
        if (window.loadWeather.__gelombangHooked) return;

        var asliLoadWeather = window.loadWeather;
        window.loadWeather = async function () {
            var hasil = await asliLoadWeather.apply(this, arguments);
            // Fetch gelombang paralel — tidak menunggu loadWeather selesai,
            // langsung render setelah datanya ada
            Promise.all([fetchKelvinWave(), fetchRossbyWave()]).then(function (data) {
                renderKotakGelombang(data[0], data[1]);
            });
            return hasil;
        };
        window.loadWeather.__gelombangHooked = true;
        console.log('%c✅ [gelombang_ekuator] Hook ke loadWeather terpasang', 'color:#d946ef;font-weight:bold;');
    }

    // ============================================================
    //  BAGIAN 5 — FUNGSI MANUAL (bisa dipanggil dari console)
    // ============================================================

    /**
     * Panggil dari console: window.tampilkanGelombangEkuator()
     * Berguna jika tab Cuaca sudah terbuka sebelum patch ini dimuat.
     */
    window.tampilkanGelombangEkuator = async function () {
        console.log('[gelombang_ekuator] Mengambil data gelombang secara manual...');
        var data = await Promise.all([fetchKelvinWave(), fetchRossbyWave()]);
        renderKotakGelombang(data[0], data[1]);
        console.log('[gelombang_ekuator] Selesai.');
    };

    /**
     * Diagnostik: cek semua gelombang ekuatorial
     * Panggil: window.cekGelombangEkuator()
     */
    window.cekGelombangEkuator = function () {
        console.log('%c=== CEK GELOMBANG EKUATORIAL ===', 'color:#d946ef;font-weight:bold;');
        console.log('MJO (window.mjoData):', window.mjoData
            ? ('Fase ' + window.mjoData.fase + ' | Amp ' + window.mjoData.amplitudo)
            : '❌ TIDAK ADA — cek mjo_loader.js');
        console.log('Kelvin Wave (window.kelvinData):', window.kelvinData
            ? (window.kelvinData.label + ' | Indeks ' + window.kelvinData.indeksKelvin)
            : '❌ TIDAK ADA — cek GAS_ENDPOINTS.kelvin');
        console.log('Rossby Wave (window.rossbyData):', window.rossbyData
            ? (window.rossbyData.label + ' | Indeks ' + window.rossbyData.indeksRossby)
            : '❌ TIDAK ADA — cek GAS_ENDPOINTS.rossby');
        console.log('URL Kelvin GAS:', _KELVIN_URL || '⚠️ BELUM DIISI');
        console.log('URL Rossby GAS:', _ROSSBY_URL || '⚠️ BELUM DIISI');
        console.log('%c=== SELESAI ===', 'color:#d946ef;font-weight:bold;');
    };

    // ============================================================
    //  INIT
    // ============================================================

    /**
     * Deteksi apakah loadWeather sudah pernah jalan sebelum patch ini
     * dimuat — dengan memeriksa apakah elemen hasil cuaca sudah berisi
     * konten (weatherData sudah terisi) atau GPS sudah terkunci.
     * Jika ya, langsung fetch tanpa menunggu hook terpicu.
     */
    function cekDanFetchLangsung() {
        // Tanda 1: elemen weatherData sudah ada dan berisi konten
        var weatherData = document.getElementById('weatherData');
        var sudahAdaKonten = weatherData && weatherData.children.length > 0;

        // Tanda 2: GPS sudah tersedia (koordinat tersimpan di salah satu variabel umum)
        var sudahGPS = (window._lokasiCuaca && window._lokasiCuaca.lat) ||
                       (window._lokasiKalender && window._lokasiKalender.lat) ||
                       (window.currentLat && window.currentLon);

        if (sudahAdaKonten || sudahGPS) {
            console.log(
                '%c[gelombang_ekuator] loadWeather sudah jalan sebelum patch ini — fetch Kelvin+Rossby langsung sekarang...',
                'color:#d946ef;'
            );
            Promise.all([fetchKelvinWave(), fetchRossbyWave()]).then(function (data) {
                renderKotakGelombang(data[0], data[1]);
            });
        } else {
            console.log('[gelombang_ekuator] GPS belum aktif — menunggu hook loadWeather berjalan...');
        }
    }

    /**
     * Pantau perubahan tab — jika user pindah ke tab Risiko Cuaca dan
     * data gelombang belum ada, fetch otomatis saat itu juga.
     * Ini menangani kasus di mana GPS baru aktif setelah patch dimuat.
     */
    function pasangObserverTab() {
        // Deteksi klik tab Cuaca/Risiko Cuaca
        document.addEventListener('click', function (e) {
            var target = e.target;
            var teks = (target.textContent || '').toLowerCase();
            var adaTabCuaca = teks.includes('cuaca') || teks.includes('risiko cuaca');
            if (!adaTabCuaca) return;
            // Tunda sedikit agar konten tab sempat dirender
            setTimeout(function () {
                if (!window.kelvinData && !window.rossbyData) {
                    console.log('[gelombang_ekuator] Tab Cuaca diklik, Kelvin/Rossby belum ada — fetch sekarang...');
                    Promise.all([fetchKelvinWave(), fetchRossbyWave()]).then(function (data) {
                        renderKotakGelombang(data[0], data[1]);
                    });
                } else {
                    // Data sudah ada tapi mungkin kotak belum dirender (DOM baru dibuat ulang)
                    setTimeout(function () {
                        if (!document.getElementById('kotakGelombangEkuator')) {
                            renderKotakGelombang(window.kelvinData, window.rossbyData);
                        }
                    }, 400);
                }
            }, 600);
        }, true); // capture phase agar menangkap klik sebelum handler lain
    }

    function init() {
        pasangKelvinKeRisikoDinamis();
        hookLoadWeather();
        pasangObserverTab();

        // Cek langsung apakah cuaca sudah tampil sebelum patch ini dimuat
        // (race condition yang terjadi di screenshot user)
        setTimeout(cekDanFetchLangsung, 500);

        window.__gelombangEkuatorV1Aktif = true;
        console.log(
            '%c✅ patch_gelombang_ekuator_v1.js AKTIF\n' +
            '   window.cekGelombangEkuator() → cek status tiga gelombang\n' +
            '   window.tampilkanGelombangEkuator() → render manual jika perlu\n' +
            '   Race condition fix: fetch otomatis jika loadWeather sudah jalan sebelumnya',
            'color:#d946ef;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 900); });
    } else {
        setTimeout(init, 900);
    }

})();
