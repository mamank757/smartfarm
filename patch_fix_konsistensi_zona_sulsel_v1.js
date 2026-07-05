/**
 * ============================================================
 * patch_fix_konsistensi_zona_sulsel_v1.js
 * Tutup celah bounding-box & selaraskan 2 sistem klasifikasi zona
 * ------------------------------------------------------------
 * MASALAH:
 *   Ada DUA sistem klasifikasi zona iklim yang berjalan SENDIRI-
 *   SENDIRI dan bisa saling tidak sepakat:
 *
 *   1) patch_zom_kalibrasi_v2.js → deteksiZonaIklimV2(lat, lon)
 *      Dipakai untuk LABEL TAMPILAN & bobot RISIKO IKLIM/6-faktor.
 *      Berbasis kotak lat/lon statis, TANPA melihat kurva hujan asli.
 *
 *   2) patch_deteksi_musim_v1.js → tentukanKalenderMusimLokal(lat,lon,rawZOM)
 *      Dipakai mesin PENJADWALAN sungguhan (yang memilih bulan
 *      tanam). Punya tabel REFERENSI_MUSIM_REGIONAL yang lebih
 *      rinci untuk Sulawesi, DAN fallback berbasis kurva hujan
 *      ASLI (bukan cuma kotak lat/lon) untuk wilayah lain.
 *
 *   Karena keduanya independen, sebuah titik koordinat bisa saja
 *   "monsunal" menurut sistem (1) tapi "lokal/timur" menurut sistem
 *   (2) — seperti yang terjadi di sekitar lat -4 s.d. -6, lon 119
 *   s.d. 120,8 (Sulsel/Sultra), karena kotak "lokal" di sistem (1)
 *   mensyaratkan lon ≥ 120,5 sementara kotak "peralihan" mensyarat-
 *   kan lat ≥ -4,0 — ada celah segitiga kecil yang tidak masuk
 *   kotak manapun dan jatuh ke default 'monsunal'.
 *
 * PERBAIKAN (bersifat nasional, bukan tambal 1 titik):
 *   Sebelum memanggil logika kotak lat/lon yang lama, cek DULU
 *   apakah titik ini masuk salah satu kotak di REFERENSI_MUSIM_
 *   REGIONAL milik mesin penjadwalan (sumber yang lebih rinci &
 *   sudah dipakai sungguhan untuk keputusan tanam). Kalau cocok,
 *   pakai hasil itu — otomatis konsisten dengan mesin penjadwalan
 *   dan tidak ada celah di area yang ditabelkan itu. Kalau TIDAK
 *   cocok (di luar cakupan tabel Sulawesi ini), baru jatuh ke
 *   logika kotak lat/lon lama (yang mencakup Sumatera, Kalimantan,
 *   NTT, Papua, dsb — tidak diubah, tidak disentuh).
 *
 * CARA PASANG — letakkan SETELAH patch_zom_kalibrasi_v2.js:
 *   <script src="patch_zom_kalibrasi_v2.js"></script>
 *   <script src="patch_fix_konsistensi_zona_sulsel_v1.js"></script>  ← file ini
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__fixKonsistensiZonaSulselAktif) {
        console.warn('[fix_zona_sulsel] sudah aktif, skip.');
        return;
    }

    // Disalin 1:1 dari REFERENSI_MUSIM_REGIONAL di patch_deteksi_musim_v1.js,
    // dipetakan ke nama zona 6-kelas yang dipakai deteksiZonaIklimV2.
    // Satu sumber tabel, dua konsumen — tidak ada lagi peluang berbeda hasil.
    var REFERENSI_REGIONAL_KE_ZONA = [
        { latMin: -6.0,  latMaks: -3.5,  lonMin: 119.0, lonMaks: 119.99, zona: 'monsunal'  }, // barat
        { latMin: -6.0,  latMaks: -3.5,  lonMin: 120.0, lonMaks: 120.79, zona: 'lokal'      }, // timur (anti-monsun)
        { latMin: -6.0,  latMaks: -2.5,  lonMin: 120.8, lonMaks: 124.5,  zona: 'peralihan'  }, // peralihan_sultra
        { latMin: -3.49, latMaks: -0.5,  lonMin: 118.5, lonMaks: 119.79, zona: 'monsunal'  }, // barat
        { latMin: -3.49, latMaks: 0.0,   lonMin: 119.8, lonMaks: 122.5,  zona: 'ekuatorial' }  // ekuatorial_dua_puncak
    ];

    function cariDiReferensiRegional(lat, lon) {
        for (var i = 0; i < REFERENSI_REGIONAL_KE_ZONA.length; i++) {
            var r = REFERENSI_REGIONAL_KE_ZONA[i];
            if (lat >= r.latMin && lat <= r.latMaks && lon >= r.lonMin && lon <= r.lonMaks) {
                return r.zona;
            }
        }
        return null;
    }

    function pasang(tick) {
        tick = tick || 0;
        if (typeof window._deteksiZonaIklimV2 !== 'function') {
            if (tick >= 80) {
                console.error('[fix_zona_sulsel] window._deteksiZonaIklimV2 tidak tersedia — cek urutan <script>.');
                return;
            }
            setTimeout(function () { pasang(tick + 1); }, 100);
            return;
        }
        if (window._deteksiZonaIklimV2.__konsistensiSulselFixed) return;

        var asli = window._deteksiZonaIklimV2;

        var dibungkus = function (lat, lon) {
            var dariRegional = cariDiReferensiRegional(lat, lon);
            if (dariRegional) return dariRegional;
            return asli(lat, lon);
        };

        dibungkus.__konsistensiSulselFixed = true;
        window._deteksiZonaIklimV2 = dibungkus;

        window.__fixKonsistensiZonaSulselAktif = true;
        console.log(
            '%c✅ patch_fix_konsistensi_zona_sulsel_v1.js aktif\n' +
            '   Klasifikasi zona utk area Sulsel/Sultra kini selalu sinkron dengan\n' +
            '   tabel REFERENSI_MUSIM_REGIONAL milik mesin penjadwalan — celah kotak\n' +
            '   lat/lon lama sudah tertutup.',
            'color:#10b981;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasang, 900); });
    } else {
        setTimeout(pasang, 900);
    }

})();
