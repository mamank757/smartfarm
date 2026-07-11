/**
 * ============================================================
 * patch_fix_integrasi_6faktor_v1.js
 * Perbaikan wiring RISIKO IKLIM & KALENDER TNM — PPL Milenial Wajo
 * ------------------------------------------------------------
 * CARA PASANG:
 *   Letakkan PALING TERAKHIR di index.html, setelah
 *   patch_network_optimasi_v1.js (script terakhir yang ada
 *   sekarang). Patch ini hanya menambah/membungkus fungsi yang
 *   sudah ada, tidak mengubah file lain.
 *
 * APA YANG DIPERBAIKI:
 *
 * [FIX-A] SST lokal sekarang data ASLI, bukan proxy ENSO.
 *   Sebelumnya getAnomaliSSTLokal() di patch_skor_6faktor_v1.js
 *   mengecek window._sstLokalCache yang TIDAK PERNAH diisi oleh
 *   patch manapun, sehingga selalu jatuh ke fallback sintetis
 *   (-ensoVal * 0.35) — yang artinya bobot "SST 18%" sebenarnya
 *   cuma menduplikasi ENSO (30%) dengan nama lain.
 *   Fix ini membungkus window.getLocalSSTTimeseries (dipanggil
 *   dari loadGlobalClimateIndices, baik dari tab Cuaca maupun
 *   tombol "TAMPILKAN GRAFIK ANCAMAN IKLIM") dan menyimpan hasil
 *   nyatanya ke window._sstLokalCache setiap kali berhasil.
 *   Catatan: pada klik PERTAMA di tab RISIKO IKLIM, cache ini
 *   mungkin belum terisi (request SST belum selesai), sehingga
 *   skor masih memakai fallback untuk perhitungan itu saja.
 *   Klik kedua dan seterusnya (atau setelah pernah membuka tab
 *   Cuaca) akan memakai data SST asli.
 *
 * [FIX-B] Satu sumber kebenaran untuk zona iklim.
 *   Sebelumnya tentukanZonaIklim() (dipakai RISIKO IKLIM,
 *   KALENDER TNM, dan skor_6faktor untuk bobot ENSO/IOD) memakai
 *   4 zona kasar, SEDANGKAN deteksiZonaIklimV2() di
 *   patch_zom_kalibrasi_v2.js (dipakai kotak "Kesimpulan Prediksi
 *   Iklim Terpadu") memakai 6 zona yang sudah dikalibrasi sesuai
 *   ZOM BMKG. Untuk Wajo sendiri keduanya berbeda hasil: yang lama
 *   bilang "monsunal", yang baru (lebih akurat) bilang "lokal/
 *   anti-monsunal". Fix ini membuat tentukanZonaIklim() delegasi
 *   ke deteksiZonaIklimV2() lalu dipetakan turun ke 4 kategori
 *   yang dipahami tabel BOBOT_IKLIM, sehingga RISIKO IKLIM,
 *   KALENDER TNM, dan kotak Kesimpulan Iklim Terpadu akhirnya
 *   memakai zona yang SAMA untuk lokasi yang sama.
 *
 * [FIX-C] Urutan musim rendeng/gadu dikembalikan ke kronologis.
 *   hasil.sort() di patch_skor_6faktor_v1.js membandingkan
 *   nilaiTotal yang selalu undefined (jadi 0 vs 0) — secara
 *   kebetulan tidak merusak urutan hari ini karena sort modern
 *   stabil, tapi berbahaya kalau field nilaiTotal suatu saat
 *   ditambahkan tanpa sadar konsekuensi ini. Fix ini memaksa
 *   urutan akhir selalu berdasarkan tanggal tanam, bukan skor
 *   yang tidak pernah benar-benar ada.
 *
 * [DIAGNOSTIK] window.cekIntegrasi6Faktor()
 *   Panggil dari console browser (F12) untuk memeriksa apakah
 *   keenam sumber data (ZOM, ENSO, IOD, MJO, SST, Fase Bulan)
 *   benar-benar mengalir di perangkat Anda saat ini.
 *
 * YANG TIDAK DIPERBAIKI DI SINI (perlu kerja lebih dalam):
 *   Bonus SST/MJO/Fase Bulan untuk KALENDER TNM (bukan RISIKO
 *   IKLIM) masih sebatas informasi teks "📊 Faktor 6F: ..." di
 *   alasan, BELUM ikut menentukan tanggal tanam/varietas yang
 *   dipilih. Ini karena titik pemilihan kandidat ada di dalam
 *   IIFE privat patch_deteksi_musim_v3.0.1.js — memperbaikinya
 *   dengan aman butuh fork sebagian logika tersebut, bukan
 *   sekadar wrapper dari luar. Beri tahu saya kalau ingin saya
 *   kerjakan bagian ini juga.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__fixIntegrasi6FaktorAktif) {
        console.warn('[fix6F] patch_fix_integrasi_6faktor_v1.js sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  [FIX-A] Cache SST lokal asli
    // ============================================================
    function pasangCacheSST(tick) {
        tick = tick || 0;
        if (typeof window.getLocalSSTTimeseries !== 'function') {
            if (tick >= 50) {
                console.error('[fix6F] window.getLocalSSTTimeseries tidak pernah tersedia setelah 5 detik — cek urutan <script>.');
                return;
            }
            setTimeout(function () { pasangCacheSST(tick + 1); }, 100);
            return;
        }
        if (window.getLocalSSTTimeseries.__sstCacheWrapped) return;

        var asli = window.getLocalSSTTimeseries;
        window.getLocalSSTTimeseries = async function () {
            var hasil = await asli.apply(this, arguments);
            if (hasil && typeof hasil === 'object') {
                window._sstLokalCache = hasil;
                console.log(
                    '[fix6F] Cache SST lokal terisi: ' +
                    (hasil.nama1 || 'Laut1') + ' ' + hasil.sstBoneTerkini + '°C, ' +
                    (hasil.nama2 || 'Laut2') + ' ' + hasil.sstMksTerkini + '°C'
                );
            }
            return hasil;
        };
        window.getLocalSSTTimeseries.__sstCacheWrapped = true;
        console.log('%c✅ [fix6F] Cache SST lokal terpasang — skor_6faktor kini pakai data SST nyata setelah panggilan pertama selesai', 'color:#10b981;font-weight:bold;');
    }

    // ============================================================
    //  [FIX-B] Satu sumber kebenaran zona iklim
    // ============================================================
    var PETA_6_KE_4 = {
        monsunal:       'monsunal',
        ekuatorial:     'ekuatorial',
        peralihan:      'peralihan',
        lokal:          'lokal',
        hst_basah:      'lokal',     // pengaruh ENSO/IOD sama-sama kecil
        kering_ekstrem: 'monsunal'   // pengaruh ENSO sangat dominan, paling dekat ke monsunal
    };

    function pasangZonaIklimSatuSumber(tick) {
        tick = tick || 0;
        if (typeof window._deteksiZonaIklimV2 !== 'function') {
            if (tick >= 50) {
                console.error('[fix6F] window._deteksiZonaIklimV2 tidak ditemukan — pastikan patch_zom_kalibrasi_v2.js dimuat sebelum patch ini.');
                return;
            }
            setTimeout(function () { pasangZonaIklimSatuSumber(tick + 1); }, 100);
            return;
        }
        if (window.tentukanZonaIklim && window.tentukanZonaIklim.__satuSumber) return;

        window.tentukanZonaIklim = function (lat, lon) {
            var zona6 = window._deteksiZonaIklimV2(lat, lon);
            return PETA_6_KE_4[zona6] || 'monsunal';
        };
        window.tentukanZonaIklim.__satuSumber = true;
        console.log('%c✅ [fix6F] tentukanZonaIklim kini delegasi ke klasifikasi 6-zona (sama dengan Kesimpulan Iklim Terpadu)', 'color:#10b981;font-weight:bold;');
    }

    // ============================================================
    //  [FIX-C] Urutan musim selalu kronologis, tidak bergantung
    //  nilaiTotal yang tidak pernah ada
    // ============================================================
    function pasangUrutanKronologis(tick) {
        tick = tick || 0;
        if (typeof window.rekomendasiWindowTanam !== 'function') {
            if (tick >= 50) return;
            setTimeout(function () { pasangUrutanKronologis(tick + 1); }, 100);
            return;
        }
        if (window.rekomendasiWindowTanam.__urutanKronologisFixed) return;

        var asli = window.rekomendasiWindowTanam;
        var dibungkus = function () {
            var hasil = asli.apply(this, arguments);
            if (Array.isArray(hasil)) {
                hasil.sort(function (a, b) {
                    var ta = (a && a.tglTanam) ? a.tglTanam.getTime() : 0;
                    var tb = (b && b.tglTanam) ? b.tglTanam.getTime() : 0;
                    return ta - tb;
                });
            }
            return hasil;
        };
        dibungkus.__urutanKronologisFixed = true;
        window.rekomendasiWindowTanam = dibungkus;
        console.log('%c✅ [fix6F] Urutan musim rendeng/gadu dipastikan kronologis, tidak lagi bergantung field nilaiTotal yang tidak ada', 'color:#10b981;font-weight:bold;');
    }

    // ============================================================
    //  [MERGED — eks BUG-1 patch_bugfix_b1b3_v1.js]
    //  Perbaiki label "📍 Zona Iklim" di RISIKO IKLIM
    //  ------------------------------------------------------------
    //  patch_risiko_iklim.js menyebut tentukanZonaIklim LOKAL (4 zona
    //  lama) sebagai referensi di dalam closure-nya sendiri, bukan
    //  window.tentukanZonaIklim — jadi override [FIX-B] di atas tidak
    //  berdampak ke TEKS zona yang muncul di UI (walau kalkulasi skor
    //  risiko 0-100 sudah benar sejak patch_skor_6faktor_v1.js). Fix
    //  ini membaca ulang DOM #teksAnalisisFase setelah setiap analisis
    //  dan mengganti teks zona dengan hasil klasifikasi 6-zona (V2).
    // ============================================================

    var LABEL_6ZONA_FIX = {
        monsunal:       'MONSUNAL',
        ekuatorial:     'EKUATORIAL',
        peralihan:      'PERALIHAN',
        lokal:          'LOKAL / ANTI-MONSUNAL',
        hst_basah:      'PANTAI BASAH (HST)',
        kering_ekstrem: 'SEMI-ARID / KERING EKSTREM'
    };

    function getZonaBenarUntukLabel(lat, lon) {
        if (typeof window._deteksiZonaIklimV2 === 'function') {
            return window._deteksiZonaIklimV2(lat, lon);
        }
        if (typeof window.tentukanZonaIklim === 'function' &&
            window.tentukanZonaIklim.__satuSumber) {
            return window.tentukanZonaIklim(lat, lon);
        }
        return null;
    }

    function perbaikiLabelZonaRisiko() {
        var koord = (window._lokasiKalender && window._lokasiKalender.lat != null)
            ? window._lokasiKalender
            : null;
        if (!koord) return;

        var zonaBenar = getZonaBenarUntukLabel(koord.lat, koord.lon);
        if (!zonaBenar) return;

        var labelBenar = LABEL_6ZONA_FIX[zonaBenar] || zonaBenar.toUpperCase();
        var kontainer  = document.getElementById('teksAnalisisFase');
        if (!kontainer) return;

        var diperbaiki = false;
        kontainer.querySelectorAll('b').forEach(function (el) {
            var teks = el.textContent || '';
            var tampakZona = /^(MONSUNAL|EKUATORIAL|PERALIHAN|LOKAL|PANTAI|SEMI-ARID|ANTI-MONSUNAL|HST)/.test(teks.trim());
            if (tampakZona && teks !== labelBenar) {
                el.textContent = labelBenar;
                diperbaiki = true;
            }
        });

        if (diperbaiki) {
            kontainer.querySelectorAll('div').forEach(function (div) {
                var t = div.textContent || '';
                if (t.includes('ZONA:') && !t.includes(labelBenar)) {
                    div.innerHTML = div.innerHTML.replace(
                        /ZONA:\s*[A-Z\/ \-]+/,
                        'ZONA: ' + labelBenar + ' <span style="color:#d946ef;font-size:0.65em;">(V2)</span>'
                    );
                }
            });
            console.log(
                '%c[fix6F] Label zona di RISIKO IKLIM diperbaiki → ' + labelBenar,
                'color:#d946ef;'
            );
        }
    }

    function pasangLabelZonaFix(tick) {
        tick = tick || 0;
        if (typeof window.prosesAnalisisKalender !== 'function') {
            if (tick >= 80) {
                console.error('[fix6F] window.prosesAnalisisKalender tidak tersedia — label zona fix tidak terpasang.');
                return;
            }
            setTimeout(function () { pasangLabelZonaFix(tick + 1); }, 100);
            return;
        }
        if (window.prosesAnalisisKalender.__zonaLabelFixed) return;

        var asli = window.prosesAnalisisKalender;
        window.prosesAnalisisKalender = async function () {
            await asli.apply(this, arguments);
            setTimeout(perbaikiLabelZonaRisiko, 100);
        };
        window.prosesAnalisisKalender.__zonaLabelFixed = true;
        console.log('%c✅ [fix6F] Label zona RISIKO IKLIM akan diperbarui ke klasifikasi 6-zona setelah setiap analisis', 'color:#10b981;font-weight:bold;');
    }

    // ============================================================
    //  DIAGNOSTIK — panggil window.cekIntegrasi6Faktor() di console
    // ============================================================
    window.cekIntegrasi6Faktor = async function () {
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        console.log('%c=== CEK INTEGRASI 6 FAKTOR ===', 'color:#d946ef;font-weight:bold;font-size:13px;');
        console.log('Koordinat dipakai untuk tes:', lat, lon, '(ganti dengan membuka tab Cuaca/Risiko Iklim dulu jika ingin lokasi asli)');

        // ZOM
        try {
            var zona4 = (typeof window.tentukanZonaIklim === 'function') ? window.tentukanZonaIklim(lat, lon) : 'fungsi tidak ada';
            var zona6 = (typeof window._deteksiZonaIklimV2 === 'function') ? window._deteksiZonaIklimV2(lat, lon) : 'fungsi tidak ada';
            console.log('🗺️ ZOM/Zona iklim — tentukanZonaIklim:', zona4, '| deteksiZonaIklimV2:', zona6, (zona4 === (PETA_6_KE_4[zona6] || zona6) ? '✅ konsisten' : '⚠️ cek pemetaan'));
        } catch (e) { console.warn('🗺️ ZOM — error:', e.message); }

        // ENSO
        try {
            if (typeof window.getENSOAnomaly === 'function') {
                var enso = await window.getENSOAnomaly();
                console.log('🌏 ENSO:', enso.status, '| ONI terkini:', enso.latestAnomaly, '| sumber:', enso.sumber);
            } else {
                console.warn('🌏 ENSO: window.getENSOAnomaly TIDAK ADA — cek patch_enso_iod_noaa.js sudah dimuat?');
            }
        } catch (e) { console.warn('🌏 ENSO — error:', e.message); }

        // IOD
        try {
            if (typeof window.getIODAnomaly === 'function') {
                var iod = await window.getIODAnomaly();
                console.log('🌤️ IOD:', iod.status, '| DMI terkini:', iod.latestAnomaly, '| sumber:', iod.sumber);
            } else {
                console.warn('🌤️ IOD: window.getIODAnomaly TIDAK ADA');
            }
        } catch (e) { console.warn('🌤️ IOD — error:', e.message); }

        // MJO
        if (window.mjoData && window.mjoData.fase) {
            console.log('🌀 MJO: Fase', window.mjoData.fase, '| Amplitudo', window.mjoData.amplitudo, '✅ data tersedia');
        } else {
            console.warn('🌀 MJO: window.mjoData kosong/tidak ada — cek mjo_loader.js. Tanpa ini, dampak MJO dianggap netral (0), bukan error, tapi juga bukan data nyata.');
        }

        // SST
        if (window._sstLokalCache) {
            console.log('🌊 SST: cache TERISI —', window._sstLokalCache.nama1, window._sstLokalCache.sstBoneTerkini + '°C,', window._sstLokalCache.nama2, window._sstLokalCache.sstMksTerkini + '°C ✅ data asli dipakai');
        } else {
            console.warn('🌊 SST: cache KOSONG — buka tab RISIKO CUACA atau klik "TAMPILKAN GRAFIK ANCAMAN IKLIM" sekali dulu, lalu jalankan cek ini lagi. Sebelum cache terisi, skor 6-faktor memakai proxy dari ENSO, bukan SST asli.');
        }

        // Fase Bulan
        if (window._6F && typeof window._6F.hariFaseBulan === 'function') {
            var hf = window._6F.hariFaseBulan(new Date());
            console.log('🌙 Fase Bulan: hari ke-' + hf.toFixed(1) + ' dari siklus 29.53 hari ✅');
        } else {
            console.warn('🌙 Fase Bulan: window._6F tidak ditemukan — cek patch_skor_6faktor_v1.js sudah dimuat?');
        }

        console.log('%c=== SELESAI ===', 'color:#d946ef;font-weight:bold;');
    };

    function init() {
        pasangCacheSST();
        pasangZonaIklimSatuSumber();
        pasangUrutanKronologis();
        pasangLabelZonaFix();
        window.__fixIntegrasi6FaktorAktif = true;
        console.log(
            '%c✅ patch_fix_integrasi_6faktor_v1.js aktif\n' +
            'Ketik window.cekIntegrasi6Faktor() di console untuk memeriksa status 6 sumber data.\n' +
            '[MERGED] Label zona RISIKO IKLIM (eks BUG-1 patch_bugfix_b1b3_v1.js) ikut dikelola di sini.',
            'color:#10b981;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 700); });
    } else {
        setTimeout(init, 700);
    }

})();
