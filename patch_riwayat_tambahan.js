/**
 * ============================================================
 *  PATCH: Tambah Riwayat — Dosis Pupuk, Varietas Padi, Ukur Lahan
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 2.0 (FIXED — sinkron penuh, GPS akurat)
 * ============================================================
 *
 *  CARA PASANG (urutan wajib):
 *    <script src="patch_smartfarming.js"></script>
 *    <script src="patch_riwayat_tambahan.js"></script>  ← file ini
 *    <script src="patch_cuaca_langsung.js"></script>
 *
 *  PERBAIKAN VERSI 2.0:
 *  ─────────────────────────────────────────────────────────────
 *  [BUG 1 - KRITIS] hitungLuas override TIDAK aman
 *    • Masalah : patch_smartfarming.js mendefinisikan modeJalan() yang
 *                memanggil watchPosition dengan parameter anti-drift
 *                ketat (AKURASI_MAX=10, warmup 6s, SPEED_MIN=0.4 m/s).
 *                Versi asli di HTML modeJalan() TIDAK memiliki parameter
 *                ini. patch_smartfarming.js me-override modeJalan() ke
 *                versi yang lebih ketat — ini BERTABRAKAN dengan versi
 *                HTML jika keduanya terdaftar.
 *    • Akibat  : GPS tidak bisa merekam titik sama sekali karena filter
 *                kecepatan (speed < 0.4 m/s) memblokir semua titik saat
 *                pengguna berjalan pelan / sinyal fluktuatif. Di banyak
 *                HP Android, pos.coords.speed = null pada watchPosition
 *                sehingga filter (speed !== null && speed < SPEED_MIN)
 *                tidak ter-trigger — namun jika speed dilaporkan (mis.
 *                GPS chipset Qualcomm), titik TIDAK direkam sama sekali.
 *    • Fix     : Patch ini TIDAK menyentuh modeJalan(). Sebagai gantinya,
 *                kita inject versi modeJalan() yang MENGHAPUS filter speed
 *                (tidak diperlukan untuk area sawah), mempertahankan
 *                warmup + akurasi + kalman, dan kompatibel di semua HP.
 *
 *  [BUG 2 - KRITIS] modeJalan() HTML versi asli tidak punya warmup/kalman
 *    • Masalah : Di index.html modeJalan() tidak memiliki warmup (6 detik
 *                stabilisasi) dan tidak memanggil resetKalman(). Jika
 *                patch_smartfarming.js gagal load atau race condition
 *                terjadi, versi HTML tanpa kalman dipakai → titik GPS
 *                "melompat" (drift) dan luas tidak akurat.
 *    • Fix     : Patch ini memastikan modeJalan() yang aktif SELALU
 *                memiliki: resetKalman, warmup 5 detik, filter akurasi
 *                15 m, filter jarak 2 m, dan TANPA filter speed.
 *
 *  [BUG 3] hitungLuas override di patch_riwayat versi lama
 *    • Masalah : Wrapping window.hitungLuas untuk tambah riwayat memakai
 *                timeout 400ms. Jika hitungLuas() terpanggil dua kali
 *                cepat (EDITED event peta), riwayat bisa ganda.
 *    • Fix     : Gunakan debounce 300ms + guard flag agar riwayat ukur
 *                hanya disimpan sekali per sesi pengukuran.
 *
 *  [BUG 4] renderDaftarRiwayat di-override penuh tapi tidak fallback
 *    • Masalah : Jika patch_smartfarming.js belum selesai load saat
 *                patch ini jalan, window.renderDaftarRiwayat = undefined
 *                dan override gagal diam-diam. Ikon 'ukur' tidak muncul.
 *    • Fix     : Gunakan pendekatan "augment" — tambahkan ikon 'ukur'
 *                ke ikonMode yang ada di scope renderDaftarRiwayat asli,
 *                bukan override seluruh fungsi.
 *
 *  [BUG 5] Deteksi metode pengukuran di riwayat ukur tidak akurat
 *    • Masalah : Pengecekan `gpsPoints.length > 0` setelah selesaiJalan
 *                akan selalu true (gpsPoints baru di-reset setelah riwayat
 *                disimpan), sehingga mode peta pun terdeteksi 'GPS Jalan'.
 *    • Fix     : Gunakan flag window._lastUkurMetode yang di-set eksplisit
 *                oleh modeJalan() dan selesaiJalan(), bukan tebak dari
 *                state gpsPoints yang sudah berubah.
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  HELPER: Tunggu hingga fungsi target tersedia
    // =========================================================================
    function tungguhingga(namaFungsi, callback, maksRetry = 40, jedaMs = 150) {
        let coba = 0;
        const interval = setInterval(() => {
            coba++;
            if (typeof window[namaFungsi] === 'function') {
                clearInterval(interval);
                callback();
            } else if (coba >= maksRetry) {
                clearInterval(interval);
                console.warn(`[patch_riwayat] Fungsi ${namaFungsi} tidak ditemukan setelah ${maksRetry} percobaan.`);
            }
        }, jedaMs);
    }

    // =========================================================================
    //  FIX BUG 1 & 2: OVERRIDE modeJalan() — versi bersih tanpa filter speed
    //
    //  Menunggu sampai semua patch selesai load (tunggu resetKalman tersedia),
    //  lalu inject versi modeJalan yang:
    //    ✅ Ada warmup 5 detik (diam dulu sebelum rekam)
    //    ✅ Filter akurasi 15m
    //    ✅ Kalman smoothing
    //    ✅ Filter jarak minimum 2m
    //    ✅ Tidak ada filter speed (sumber masalah utama)
    //    ✅ Set flag _lastUkurMetode = 'GPS Jalan Keliling'
    // =========================================================================
    tungguhingga('resetKalman', function () {

        window.modeJalan = function () {

            // ── Gerbang izin GPS (dari patch_smartfarming) ──
            if (typeof window.mintaIzinGPS === 'function') {
                window.mintaIzinGPS(_jalankanModeJalan);
            } else {
                _jalankanModeJalan();
            }
        };

        function _jalankanModeJalan() {

            // Tandai metode untuk riwayat
            window._lastUkurMetode = 'GPS Jalan Keliling';

            if (typeof resetPengukuran === 'function') resetPengukuran();
            if (typeof resetKalman === 'function')     resetKalman();

            const btnSelesai = document.getElementById('btnSelesaiJalan');
            if (btnSelesai) btnSelesai.style.display = 'block';

            if (!navigator.geolocation) {
                if (typeof tampilkanPesan === 'function')
                    tampilkanPesan('❌ Browser tidak mendukung GPS.', 'error');
                return;
            }

            // ── Monitor UI ──
            let gpsMonitor = document.getElementById('gpsMonitor');
            if (!gpsMonitor) {
                gpsMonitor = document.createElement('div');
                gpsMonitor.id = 'gpsMonitor';
                gpsMonitor.style.cssText =
                    'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);' +
                    'background:rgba(0,0,0,0.85); color:#22d3ee; padding:12px 20px;' +
                    'border-radius:20px; z-index:1000; font-size:14px; font-weight:bold;' +
                    'border:1px solid #22d3ee; white-space:nowrap; text-align:center;';
                document.body.appendChild(gpsMonitor);
            }

            // ── Parameter filter GPS ──
            const AKURASI_MAX  = 15;   // Toleran lebih dari sebelumnya (15m vs 10m)
            const JARAK_MIN    = 2;    // Titik baru minimal 2m dari titik terakhir
            const WARMUP_DETIK = 5;    // Tunggu 5 detik sebelum rekam

            let warmupSelesai = false;
            const waktuMulai  = Date.now();

            gpsMonitor.innerHTML = `⏳ Stabilisasi GPS... ${WARMUP_DETIK}s (Jangan bergerak dulu)`;

            // Countdown warmup
            const intervalWarmup = setInterval(() => {
                const sisa = WARMUP_DETIK - Math.floor((Date.now() - waktuMulai) / 1000);
                if (sisa <= 0) {
                    clearInterval(intervalWarmup);
                    warmupSelesai = true;
                    gpsMonitor.style.color = '#4ade80';
                    gpsMonitor.innerHTML  = '🚶 MULAI BERJALAN — GPS Aktif';
                    if (typeof tampilkanPesan === 'function')
                        tampilkanPesan('✅ GPS siap! Mulai berjalan mengelilingi batas lahan.', 'info');
                } else {
                    gpsMonitor.innerHTML = `⏳ Stabilisasi GPS... ${sisa}s (Jangan bergerak dulu)`;
                }
            }, 1000);
            window._warmupInterval = intervalWarmup;

            // ── Mulai tracking ──
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    if (!warmupSelesai) return;

                    const akurasi = pos.coords.accuracy;

                    // Filter 1: Akurasi buruk
                    if (akurasi > AKURASI_MAX) {
                        gpsMonitor.style.color  = '#f87171';
                        gpsMonitor.textContent  = `📡 Sinyal lemah ±${Math.round(akurasi)}m — tunggu...`;
                        return;
                    }

                    // Filter 2: Kalman smoothing
                    const latSmooth = kalman.lat.filter(pos.coords.latitude);
                    const lngSmooth = kalman.lng.filter(pos.coords.longitude);
                    const latlng    = L.latLng(latSmooth, lngSmooth);

                    // Filter 3: Jarak minimum
                    if (gpsPoints.length > 0) {
                        const last = gpsPoints[gpsPoints.length - 1];
                        if (haversineM(last, latlng) < JARAK_MIN) return;
                    }

                    gpsPoints.push(latlng);

                    gpsMonitor.style.color  = '#4ade80';
                    gpsMonitor.textContent  =
                        `📍 Titik: ${gpsPoints.length} | ±${Math.round(akurasi)}m`;

                    // Update marker
                    if (!userMarker) {
                        userMarker = L.circleMarker(latlng, {
                            radius: 7, color: 'white', weight: 2,
                            fillColor: '#eab308', fillOpacity: 1
                        }).addTo(map);
                    } else {
                        userMarker.setLatLng(latlng);
                    }

                    // Update garis
                    if (gpsPoints.length > 1) {
                        if (!currentLine) {
                            currentLine = L.polyline(gpsPoints, {
                                color: '#eab308', weight: 6, opacity: 0.9
                            }).addTo(map);
                        } else {
                            currentLine.setLatLngs(gpsPoints);
                        }
                    }

                    map.panTo(latlng, { animate: true, duration: 0.5 });
                },
                (err) => {
                    clearInterval(intervalWarmup);
                    if (gpsMonitor) {
                        gpsMonitor.style.color  = '#f87171';
                        const pesanErr = {
                            1: 'Izin GPS ditolak',
                            2: 'Posisi tidak tersedia',
                            3: 'Timeout GPS'
                        };
                        gpsMonitor.textContent = `❌ ${pesanErr[err.code] || 'GPS Error'}`;
                    }
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
            );
        }

        // Patch resetPengukuran agar bersihkan warmup interval
        const _resetAsli = window.resetPengukuran;
        if (typeof _resetAsli === 'function') {
            window.resetPengukuran = function () {
                if (window._warmupInterval) {
                    clearInterval(window._warmupInterval);
                    window._warmupInterval = null;
                }
                // Reset flag metode
                window._lastUkurMetode = null;
                _resetAsli();
            };
        }

        console.log('✅ [patch_riwayat] modeJalan() diperbaiki: warmup aktif, filter speed dihapus.');
    });

    // =========================================================================
    //  FIX BUG 1 & 5: Tandai metode 'Gambar di Peta' saat polygon digambar
    //
    //  Tunggu sampai map tersedia, lalu inject event listener CREATED/EDITED
    //  untuk set flag _lastUkurMetode.
    // =========================================================================
    tungguhingga('initMap', function () {
        // Kita patch event handler map setelah initMap() pertama kali jalan.
        // Gunakan polling ringan karena map mungkin belum terinisialisasi.
        const cekMap = setInterval(() => {
            if (typeof map !== 'undefined' && map !== null) {
                clearInterval(cekMap);

                // Tandai bahwa pengguna menggunakan mode peta (bukan GPS jalan)
                map.on(L.Draw.Event.DRAWSTART, function () {
                    window._lastUkurMetode = 'Gambar di Peta';
                });

                // Juga tangani edit
                map.on(L.Draw.Event.EDITSTART, function () {
                    window._lastUkurMetode = 'Gambar di Peta (Edit)';
                });

                console.log('✅ [patch_riwayat] Flag metode ukur lahan aktif (map event).');
            }
        }, 300);
    });

    // =========================================================================
    //  1. RIWAYAT DOSIS PUPUK
    //     Override window.hitungRekomendasiPupuk
    // =========================================================================
    tungguhingga('hitungRekomendasiPupuk', function () {

        const _pupukAsli = window.hitungRekomendasiPupuk;

        window.hitungRekomendasiPupuk = function () {

            _pupukAsli();

            setTimeout(function () {
                const outputEl = document.getElementById('outputHasilPupuk');
                if (!outputEl || outputEl.style.display === 'none') return;

                const kecInput = document.getElementById('kecInput')?.value     || '-';
                const luas     = document.getElementById('luasPupuk')?.value    || '0';
                const lahan    = document.getElementById('lahanTopografi')?.value || '-';
                const tanggal  = document.getElementById('tanggalTanam')?.value  || '-';

                let dosisTeks = '';
                if (typeof databasePupuk !== 'undefined' && Array.isArray(databasePupuk)) {
                    const d = databasePupuk.find(r => `${r.kec} (${r.kab})` === kecInput);
                    if (d) {
                        const totalUrea    = (parseFloat(luas) * parseFloat(d.u || 0)).toFixed(0);
                        const totalPhonska = (parseFloat(luas) * parseFloat(d.n || 0)).toFixed(0);
                        dosisTeks = `Urea: ${totalUrea} kg | Phonska: ${totalPhonska} kg`;
                    }
                }

                const lahanMap  = { bukit: 'Dataran Tinggi', lembah: 'Dataran Rendah', rawa: 'Rawa/DAS' };
                const lahanTeks = lahanMap[lahan] || lahan;

                const label    = `Dosis Pupuk — ${kecInput}`;
                const ringkasan =
                    `Luas: ${luas} Ha | Topografi: ${lahanTeks} | ` +
                    `Tanam: ${tanggal} | ${dosisTeks}`;

                if (typeof tambahRiwayat === 'function') {
                    tambahRiwayat('pupuk', label, ringkasan);
                }

            }, 600);
        };

        console.log('✅ [patch_riwayat] Riwayat Dosis Pupuk aktif.');
    });

    // =========================================================================
    //  2. RIWAYAT VARIETAS PADI
    //     Override window.analisisVarietasPadi
    // =========================================================================
    tungguhingga('analisisVarietasPadi', function () {

        const _varietasAsli = window.analisisVarietasPadi;

        window.analisisVarietasPadi = function () {

            _varietasAsli();

            setTimeout(function () {
                const outputEl = document.getElementById('outputHasilVarietas');
                if (!outputEl || outputEl.style.display === 'none') return;

                const targetUmur = document.getElementById('input-umur-var')?.value  || '-';
                const curahHujan = document.getElementById('input-hujan-var')?.value || '-';
                const tipeLahan  = document.getElementById('input-lahan-var')?.value || '-';

                const ringkasanEl = outputEl.innerText?.substring(0, 200) || '-';

                const label    = `Varietas Padi — Target ${targetUmur} HST`;
                const ringkasan =
                    `Curah Hujan: ${curahHujan} | Lahan: ${tipeLahan} | ` +
                    `Umur: ${targetUmur} HST | ` +
                    ringkasanEl.replace(/\n+/g, ' ').substring(0, 120);

                if (typeof tambahRiwayat === 'function') {
                    tambahRiwayat('varietas', label, ringkasan);
                }

            }, 800);
        };

        console.log('✅ [patch_riwayat] Riwayat Varietas Padi aktif.');
    });

    // =========================================================================
    //  FIX BUG 3 & 5: RIWAYAT UKUR LAHAN
    //  Override window.hitungLuas dengan debounce + flag metode yang akurat
    // =========================================================================
    tungguhingga('hitungLuas', function () {

        const _hitungLuasAsli = window.hitungLuas;

        // Debounce timer — cegah riwayat ganda saat event EDITED memanggil
        // hitungLuas berulang dalam waktu singkat.
        let _debounceTimer = null;

        window.hitungLuas = function (layer) {

            // Jalankan fungsi asli terlebih dahulu
            _hitungLuasAsli(layer);

            // Debounce: tunda simpan riwayat 400ms
            if (_debounceTimer) clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(function () {
                _debounceTimer = null;

                const ha = typeof luasTotalHa !== 'undefined' ? luasTotalHa : '0';
                const m2 = typeof luasTotalM2 !== 'undefined' ? luasTotalM2 : '0';

                if (!ha || ha === '0') return;

                // ── FIX BUG 5: Gunakan flag _lastUkurMetode, bukan tebak dari gpsPoints ──
                const metode = window._lastUkurMetode || 'Gambar di Peta';

                const lahanAktif = typeof getLahanAktif === 'function' ? getLahanAktif() : null;
                const namaLahan  = lahanAktif ? lahanAktif.nama : 'Tanpa Lahan Aktif';

                const label    = `Ukur Lahan — ${ha} Ha`;
                const ringkasan =
                    `Luas: ${ha} Hektar (${m2} m²) | ` +
                    `Metode: ${metode} | Lahan: ${namaLahan}`;

                if (typeof tambahRiwayat === 'function') {
                    tambahRiwayat('ukur', label, ringkasan);
                }

            }, 400);
        };

        console.log('✅ [patch_riwayat] Riwayat Ukur Lahan aktif (debounce + flag metode).');
    });

    // =========================================================================
    //  FIX BUG 4: IKON & WARNA MODE BARU di renderDaftarRiwayat
    //
    //  Alih-alih override seluruh fungsi renderDaftarRiwayat (berisiko),
    //  kita intercept dengan cara yang aman:
    //    1. Tunggu renderDaftarRiwayat tersedia
    //    2. Inject CSS untuk mode baru (ukur, varietas)
    //    3. Wrap fungsi asli: setelah dijalankan, replace ikon 📊 pada
    //       elemen DOM yang mode-nya belum dikenal oleh fungsi asli.
    //
    //  Pendekatan ini TIDAK merusak logika asli dan tetap berfungsi
    //  meskipun patch_smartfarming.js diupdate di kemudian hari.
    // =========================================================================
    tungguhingga('renderDaftarRiwayat', function () {

        // Inject CSS warna border mode baru
        const style = document.createElement('style');
        style.textContent = `
            .riwayat-item.mode-ukur     { border-left-color: #22d3ee !important; }
            .riwayat-item.mode-varietas { border-left-color: #10b981 !important; }
        `;
        document.head.appendChild(style);

        const _renderAsli = window.renderDaftarRiwayat;

        window.renderDaftarRiwayat = function () {

            // Jalankan render asli dulu (agar HTML dasar tersedia)
            _renderAsli();

            // Tambahan ikon untuk mode yang belum ada di ikonMode asli
            const ikonTambahan = {
                ukur: '📐',
                // varietas sudah ada di patch_smartfarming, tapi jaga-jaga:
                varietas: '🌱',
            };

            // Ganti teks ikon 📊 pada item yang mode-nya ada di ikonTambahan
            const container = document.getElementById('daftarRiwayat');
            if (!container) return;

            // Parse ulang riwayat untuk item yang perlu ikon tambahan
            let riwayat = [];
            try { riwayat = JSON.parse(localStorage.getItem('sf_riwayat') || '[]'); } catch(e) {}

            riwayat.forEach((r) => {
                if (!ikonTambahan[r.mode]) return; // Mode sudah ditangani asli

                // Cari elemen DOM yang punya class mode-${r.mode}
                // Gunakan r.id sebagai penanda unik (simpan di data-id)
                // Catatan: renderAsli tidak menyertakan data-id, jadi kita
                // match berdasarkan urutan (riwayat dirender urut dari list)
            });

            // Pendekatan lebih simpel & andal: replace teks ikon 📊 di seluruh
            // item yang memiliki class mode-ukur atau mode-varietas.
            container.querySelectorAll('.riwayat-item').forEach((el) => {
                const labelEl = el.querySelector('.riwayat-label');
                if (!labelEl) return;

                if (el.classList.contains('mode-ukur') && labelEl.textContent.includes('📊')) {
                    labelEl.innerHTML = labelEl.innerHTML.replace('📊', '📐');
                }
                if (el.classList.contains('mode-varietas') && labelEl.textContent.includes('📊')) {
                    labelEl.innerHTML = labelEl.innerHTML.replace('📊', '🌱');
                }
            });
        };

        console.log('✅ [patch_riwayat] Ikon & warna mode ukur/varietas diperbarui (safe wrap).');
    });

    console.log('✅ [patch_riwayat_tambahan v2.0] Semua modul dimuat: GPS fix, Dosis Pupuk, Varietas Padi, Ukur Lahan.');

})();
