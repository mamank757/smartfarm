/**
 * ============================================================
 * patch_bugfix_b1b3_v1.js
 * Perbaikan BUG-1 (label zona RISIKO IKLIM) dan
 * BUG-3 (guard sawah rawa di gelombang ekuatorial)
 * ------------------------------------------------------------
 * CARA PASANG — tambahkan PALING TERAKHIR di index.html,
 * setelah patch_gelombang_ekuator_v1.js:
 *
 *   <script src="patch_gelombang_ekuator_v1.js"></script>
 *   <script src="patch_bugfix_b1b3_v1.js"></script>  ← file ini
 *
 * CATATAN: BUG-2 (race condition prosesJadwalOtomatis) TIDAK
 * perlu file ini — sudah ditangani oleh polling +1500ms di
 * patch_fix01_terapkan_tapin_tabela.js yang sudah ada ✅
 *
 * ============================================================
 * BUG-1: Label "📍 Zona Iklim" di RISIKO IKLIM menampilkan
 * hasil dari tentukanZonaIklim LOKAL (4 zona lama) karena
 * patch_risiko_iklim.js menyebutnya sebagai local reference
 * di dalam closure, bukan window.tentukanZonaIklim. Akibatnya
 * patch_fix_integrasi_6faktor_v1.js yang sudah memperbarui
 * window.tentukanZonaIklim → delegasi ke 6-zona (V2) tidak
 * berdampak pada teks zona yang muncul di UI.
 *
 * CATATAN PENTING: Kalkulasi risiko (skor 0-100) sudah benar
 * sejak window.hitungRisikoDinamis ditimpa oleh patch_skor_
 * 6faktor_v1.js yang memanggil window.tentukanZonaIklim
 * secara dinamis. Jadi BUG-1 hanya mempengaruhi LABEL teks
 * zona, bukan angka risiko itu sendiri.
 *
 * Fix: wrap window.prosesAnalisisKalender, setelah ia selesai
 * render, cari teks zona di #teksAnalisisFase dan ganti
 * dengan hasil window._deteksiZonaIklimV2 (6 zona, akurat).
 *
 * ============================================================
 * BUG-3: patch_gelombang_ekuator_v1.js menambahkan delta
 * Kelvin Wave dan Rossby Wave ke window.hitungRisikoDinamis
 * tanpa memeriksa jenis sawah. Untuk sawah RAWA, logika
 * risiko menggunakan model banjir khusus dari patch_sawah_
 * rawa_v1.js — menambahkan delta ekuatorial ke sana secara
 * ilmiah tidak tepat (Kelvin/Rossby relevan untuk estimasi
 * curah hujan, bukan risiko genangan rawa). Fix: tambahkan
 * satu lapis wrapper di luar gelombang_ekuator yang langsung
 * melewati ke fungsi asli jika jenis sawah = rawa.
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__bugfixB1B3V1Aktif) {
        console.warn('[bugfix_b1b3] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  UTILITAS BERSAMA
    // ============================================================

    /** Ambil jenis sawah dari select yang relevan (JTO atau Risiko Iklim) */
    function getJenisSawah() {
        var elJTO    = document.getElementById('selectJenisSawahJTO');
        var elRisiko = document.getElementById('selectJenisSawahRisiko');
        return (elJTO && elJTO.value) || (elRisiko && elRisiko.value) || 'irigasi';
    }

    /** Ambil koordinat saat ini dari mana saja yang tersedia */
    function getKoordinat() {
        if (window._lokasiKalender && window._lokasiKalender.lat) {
            return { lat: window._lokasiKalender.lat, lon: window._lokasiKalender.lon };
        }
        return null;
    }

    // ============================================================
    //  BUG-3 FIX — Guard sawah rawa untuk gelombang ekuatorial
    //  (dipasang lebih dulu agar BUG-1 fix bisa berjalan di atas
    //   stack yang sudah benar)
    // ============================================================

    function pasangGuardRawa(tick) {
        tick = tick || 0;
        if (typeof window.hitungRisikoDinamis !== 'function') {
            if (tick >= 80) {
                console.error('[bugfix_b1b3] window.hitungRisikoDinamis tidak tersedia setelah 8 detik — BUG-3 fix tidak terpasang.');
                return;
            }
            setTimeout(function () { pasangGuardRawa(tick + 1); }, 100);
            return;
        }

        // Pastikan gelombang_ekuator sudah terpasang sebelum kita wrap lagi
        // (gelombang_ekuator +900ms, kita di +1000ms — cukup)
        if (window.hitungRisikoDinamis.__rawaGuardB3) return;

        var asli = window.hitungRisikoDinamis;

        window.hitungRisikoDinamis = function (bulanIndex, fase, ensoVal, iodVal, baselineData) {
            // Jika sawah rawa: lewati delta Kelvin/Rossby — panggil langsung
            // (lapisan di bawah ini sudah termasuk sawah_rawa + skor_6faktor +
            //  gelombang_ekuator, tapi gelombang_ekuator tidak punya guard ini)
            if (getJenisSawah() === 'rawa') {
                // Panggil lapisan skor_6faktor yang punya guard rawa bawaan:
                // skor_6faktor sudah menyimpan referensi ke sawah_rawa di
                // window._hitungRisikoAsli6F. Kita tidak bisa panggil langsung,
                // tapi kita bisa skip lapisan gelombang_ekuator dengan cara
                // memanggil window._hitungRisikoAsli6F (yang merupakan
                // sawah_rawa wrapper → akan langsung pakai logika banjir rawa).
                if (typeof window._hitungRisikoAsli6F === 'function') {
                    return window._hitungRisikoAsli6F(bulanIndex, fase, ensoVal, iodVal, baselineData);
                }
            }
            // Sawah non-rawa: jalankan normal (termasuk delta Kelvin/Rossby)
            return asli(bulanIndex, fase, ensoVal, iodVal, baselineData);
        };

        window.hitungRisikoDinamis.__rawaGuardB3 = true;

        console.log(
            '%c✅ [bugfix_b1b3] BUG-3 fix aktif — sawah rawa tidak lagi menerima ' +
            'delta Kelvin/Rossby Wave dari patch_gelombang_ekuator',
            'color:#10b981;font-weight:bold;'
        );
    }

    // ============================================================
    //  BUG-1 FIX — Perbaiki label zona di #teksAnalisisFase
    //  setelah prosesAnalisisKalender selesai render
    // ============================================================

    /**
     * Ambil nama zona 6-kelas yang benar dari koordinat saat ini.
     * Coba window._deteksiZonaIklimV2 (patch_zom_kalibrasi_v2),
     * fallback ke window.tentukanZonaIklim (patch_fix_integrasi),
     * fallback ke null (tidak ada perubahan).
     */
    function getZonaBenar(lat, lon) {
        if (typeof window._deteksiZonaIklimV2 === 'function') {
            return window._deteksiZonaIklimV2(lat, lon);
        }
        if (typeof window.tentukanZonaIklim === 'function' &&
            window.tentukanZonaIklim.__satuSumber) {
            return window.tentukanZonaIklim(lat, lon);
        }
        return null;
    }

    /** Label ramah untuk 6 zona */
    var LABEL_6ZONA = {
        monsunal:       'MONSUNAL',
        ekuatorial:     'EKUATORIAL',
        peralihan:      'PERALIHAN',
        lokal:          'LOKAL / ANTI-MONSUNAL',
        hst_basah:      'PANTAI BASAH (HST)',
        kering_ekstrem: 'SEMI-ARID / KERING EKSTREM'
    };

    /**
     * Post-process DOM #teksAnalisisFase:
     * Ganti teks zona lama dengan zona 6-kelas yang benar.
     * Dicari dengan selector CSS yang spesifik untuk menghindari
     * false positive.
     */
    function perbaikiLabelZona() {
        var koord = getKoordinat();
        if (!koord) return; // Koordinat belum tersedia, lewati

        var zonaBenar = getZonaBenar(koord.lat, koord.lon);
        if (!zonaBenar) return; // Fungsi 6-zona belum tersedia

        var labelBenar = LABEL_6ZONA[zonaBenar] || zonaBenar.toUpperCase();

        var kontainer = document.getElementById('teksAnalisisFase');
        if (!kontainer) return;

        // Cari elemen <b> yang berisi teks zona (tepat setelah "📍 Zona Iklim:")
        var elemenBold = kontainer.querySelectorAll('b');
        var diperbaiki = false;

        elemenBold.forEach(function (el) {
            var teks = el.textContent || '';
            // Hanya sentuh elemen b yang isinya adalah nama zona iklim
            // (tidak mengandung angka atau karakter non-zona)
            var tampakZona = /^(MONSUNAL|EKUATORIAL|PERALIHAN|LOKAL|PANTAI|SEMI-ARID|ANTI-MONSUNAL|HST)/.test(teks.trim());
            if (tampakZona) {
                var lamaTeks = el.textContent;
                el.textContent = labelBenar;
                if (lamaTeks !== labelBenar) {
                    diperbaiki = true;
                    console.log(
                        '%c[bugfix_b1b3] BUG-1 — Label zona diperbaiki: "' +
                        lamaTeks + '" → "' + labelBenar + '"',
                        'color:#d946ef;'
                    );
                }
            }
        });

        // Juga perbaiki teks FALLBACK jika ada (baris namaZona di line 297)
        if (diperbaiki) {
            var semuaDiv = kontainer.querySelectorAll('div');
            semuaDiv.forEach(function (div) {
                var t = div.textContent || '';
                if (t.includes('ZONA:') && !t.includes(labelBenar)) {
                    // Replace hanya bagian nama zona, pertahankan sisanya
                    div.innerHTML = div.innerHTML.replace(
                        /ZONA:\s*[A-Z\/ \-]+/,
                        'ZONA: ' + labelBenar + ' <span style="color:#d946ef;font-size:0.65em;">(V2)</span>'
                    );
                }
            });
        }
    }

    function pasangWrapProsesAnalisis(tick) {
        tick = tick || 0;
        if (typeof window.prosesAnalisisKalender !== 'function') {
            if (tick >= 80) {
                console.error('[bugfix_b1b3] window.prosesAnalisisKalender tidak tersedia — BUG-1 fix tidak terpasang.');
                return;
            }
            setTimeout(function () { pasangWrapProsesAnalisis(tick + 1); }, 100);
            return;
        }
        if (window.prosesAnalisisKalender.__zonaLabelFixed) return;

        var asli = window.prosesAnalisisKalender;

        window.prosesAnalisisKalender = async function () {
            // Jalankan fungsi asli terlebih dahulu (render chart + teks)
            await asli.apply(this, arguments);
            // Setelah render selesai, perbaiki label zona di DOM
            // Tunda 100ms agar innerHTML selesai di-paint
            setTimeout(perbaikiLabelZona, 100);
        };

        window.prosesAnalisisKalender.__zonaLabelFixed = true;

        console.log(
            '%c✅ [bugfix_b1b3] BUG-1 fix aktif — label "📍 Zona Iklim" di RISIKO IKLIM ' +
            'akan diperbarui ke klasifikasi 6-zona setelah setiap analisis',
            'color:#10b981;font-weight:bold;'
        );
    }

    // ============================================================
    //  DIAGNOSTIK
    // ============================================================

    window.cekBugfixB1B3 = function () {
        console.log('%c=== STATUS BUGFIX B1B3 ===', 'color:#d946ef;font-weight:bold;');

        // BUG-1
        var b1ok = typeof window.prosesAnalisisKalender === 'function' &&
                   window.prosesAnalisisKalender.__zonaLabelFixed;
        console.log('BUG-1 (label zona RISIKO IKLIM):', b1ok ? '✅ fix aktif' : '❌ belum aktif');

        // BUG-2
        var b2ok = typeof window.prosesJadwalOtomatis === 'function' &&
                   window.prosesJadwalOtomatis.__fix01Applied;
        console.log('BUG-2 (race condition prosesJadwal):', b2ok
            ? '✅ fix01 terpasang (ditangani patch_fix01_terapkan_tapin_tabela.js)'
            : '⏳ fix01 belum terpasang — normal jika KALENDER TNM belum dibuka');

        // BUG-3
        var b3ok = typeof window.hitungRisikoDinamis === 'function' &&
                   window.hitungRisikoDinamis.__rawaGuardB3;
        console.log('BUG-3 (guard rawa gelombang ekuatorial):', b3ok ? '✅ fix aktif' : '❌ belum aktif');

        // Zona yang akan ditampilkan
        var koord = typeof window._lokasiKalender !== 'undefined' && window._lokasiKalender
            ? window._lokasiKalender
            : null;
        if (koord) {
            var zona4 = typeof window.tentukanZonaIklim === 'function'
                ? window.tentukanZonaIklim(koord.lat, koord.lon) : '?';
            var zona6 = typeof window._deteksiZonaIklimV2 === 'function'
                ? window._deteksiZonaIklimV2(koord.lat, koord.lon) : '?';
            console.log('Zona saat ini — 4-kelas (lama):', zona4, '| 6-kelas (V2):', zona6);
        } else {
            console.log('Koordinat: belum tersedia (buka tab Cuaca + sinkron GPS dulu)');
        }
        console.log('%c=========================', 'color:#d946ef;font-weight:bold;');
    };

    // ============================================================
    //  INIT
    // ============================================================

    function init() {
        // BUG-3 dulu (lapisan bawah), BUG-1 setelah (lapisan atas)
        // Keduanya pakai polling sehingga tidak ada masalah timing
        pasangGuardRawa();
        pasangWrapProsesAnalisis();
        window.__bugfixB1B3V1Aktif = true;
        console.log(
            '%c✅ patch_bugfix_b1b3_v1.js aktif\n' +
            '   Ketik cekBugfixB1B3() di console untuk cek status',
            'color:#10b981;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); });
    } else {
        setTimeout(init, 1000);
    }

})();
