/**
 * ============================================================
 * patch_fix_konsistensi_rawa_6faktor_v1.js
 * Perbaikan inkonsistensi guard sawah RAWA di rekomendasiWindowTanam
 * ------------------------------------------------------------
 * MASALAH YANG DIPERBAIKI:
 *   patch_skor_6faktor_v1.js punya DUA override berbeda:
 *   1) window.hitungRisikoDinamis
 *      → SUDAH punya guard rawa (cek #selectJenisSawahRisiko/JTO,
 *        kalau 'rawa' langsung delegasi ke window._hitungRisikoAsli6F
 *        tanpa menghitung skor 6-faktor iklim).
 *
 *   2) window.rekomendasiWindowTanam
 *      → TIDAK punya guard rawa. Fungsi ini tetap menghitung
 *        skor6F (ENSO/IOD/SST/MJO/Fase Bulan/ZOM) untuk SEMUA
 *        kandidat yang dikembalikan rantai sebelumnya — termasuk
 *        kandidat dari patch_sawah_rawa_v1.js yang sebenarnya
 *        dipilih lewat model banjir (bukan wetness score iklim).
 *        Akibatnya setiap kandidat rawa tetap ditempeli teks:
 *          "📊 Faktor 6F: 🌊 SST ... · 🌀 MJO ... · 🌑/🌕 ..."
 *        di item.alasan — padahal secara ilmiah faktor-faktor itu
 *        tidak relevan/tidak dipakai untuk memilih tanggal tanam
 *        rawa (yang dipakai adalah threshold ZOM P65 + validasi
 *        surut-banjir, lihat patch_sawah_rawa_v1.js).
 *
 * STRATEGI PERBAIKAN:
 *   Tidak mengubah patch_skor_6faktor_v1.js (berisiko konflik
 *   versi). Sebagai gantinya, file ini dipasang PALING TERAKHIR
 *   (setelah semua wrapper rekomendasiWindowTanam lain) sehingga
 *   menjadi lapisan TERLUAR. Setelah rantai asli selesai berjalan
 *   (termasuk tempelan teks "Faktor 6F" yang salah tempat itu),
 *   kita bersihkan/ganti teks tersebut KHUSUS untuk kandidat yang
 *   memang berasal dari mode sawah rawa.
 *
 * TIDAK mengubah kandidat/tanggal/varietas yang dipilih — itu
 * sudah benar (ditentukan oleh patch_sawah_rawa_v1.js). Yang
 * diperbaiki HANYA teks "alasan" yang salah secara ilmiah.
 *
 * CARA PASANG — letakkan PALING TERAKHIR di index.html,
 * setelah patch_enso_dominance_v1.js (script terakhir saat ini):
 *
 *   <script src="patch_enso_dominance_v1.js"></script>
 *   <script src="patch_fix_konsistensi_rawa_6faktor_v1.js"></script>  ← file ini
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__fixKonsistensiRawa6FAktif) {
        console.warn('[fix_rawa_6F] sudah aktif, skip.');
        return;
    }

    /** Sama seperti getJenisSawah() di patch_bugfix_b1b3_v1.js */
    function getJenisSawah() {
        var elJTO    = document.getElementById('selectJenisSawahJTO');
        var elRisiko = document.getElementById('selectJenisSawahRisiko');
        return (elJTO && elJTO.value) || (elRisiko && elRisiko.value) || 'irigasi';
    }

    /**
     * Hapus tempelan "\n📊 Faktor 6F: ..." dari alasan, lalu ganti
     * dengan catatan yang benar bahwa kandidat ini dipilih lewat
     * model banjir rawa, bukan skor 6-faktor iklim.
     */
    function bersihkanAlasanRawa(item) {
        if (!item || typeof item.alasan !== 'string') return;

        var sudahAdaCatatan = item.alasan.indexOf('🌿 Model Rawa') !== -1;
        var punyaTagSalah   = item.alasan.indexOf('📊 Faktor 6F:') !== -1;

        if (punyaTagSalah) {
            // Buang baris "📊 Faktor 6F: ..." (dan baris sesudahnya jika ada)
            item.alasan = item.alasan.replace(/\n?📊 Faktor 6F:[^\n]*/g, '');
        }

        if (!sudahAdaCatatan) {
            item.alasan = item.alasan +
                '\n🌿 Model Rawa: tanggal & varietas ditentukan dari threshold ' +
                'ZOM P65 (surut-banjir), bukan skor ENSO/IOD/SST/MJO iklim biasa.';
        }
    }

    function pasangFix(tick) {
        tick = tick || 0;
        if (typeof window.rekomendasiWindowTanam !== 'function') {
            if (tick >= 80) {
                console.error('[fix_rawa_6F] window.rekomendasiWindowTanam tidak tersedia setelah 8 detik — cek urutan <script>.');
                return;
            }
            setTimeout(function () { pasangFix(tick + 1); }, 100);
            return;
        }
        if (window.rekomendasiWindowTanam.__rawaKonsistenFixed) return;

        var asli = window.rekomendasiWindowTanam;

        var dibungkus = function (skorBulan, rawZOM, zona, ensoVal, iodVal) {
            var hasil = asli.apply(this, arguments);

            if (Array.isArray(hasil) && getJenisSawah() === 'rawa') {
                hasil.forEach(bersihkanAlasanRawa);
                console.log(
                    '%c[fix_rawa_6F] ' + hasil.length + ' kandidat rawa dibersihkan dari ' +
                    'tempelan "Faktor 6F" yang tidak relevan',
                    'color:#1D9E75;font-weight:bold;'
                );
            }

            return hasil;
        };

        dibungkus.__rawaKonsistenFixed = true;
        window.rekomendasiWindowTanam = dibungkus;

        window.__fixKonsistensiRawa6FAktif = true;
        console.log(
            '%c✅ patch_fix_konsistensi_rawa_6faktor_v1.js aktif — teks alasan ' +
            'kandidat rawa tidak lagi ditempeli info skor 6-faktor iklim yang ' +
            'tidak relevan',
            'color:#10b981;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasangFix, 1600); });
    } else {
        setTimeout(pasangFix, 1600);
    }

})();
